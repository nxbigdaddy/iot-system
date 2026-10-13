import { Injectable, Logger } from '@nestjs/common';
import { MqttClient, connect } from 'mqtt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensorData } from '../api/src/modules/sensor-data/entities/sensor-data.entity';
import { Device } from '../api/src/modules/devices/entities/device.entity';
import { Dtu } from '../api/src/modules/dtus/entities/dtu.entity';

@Injectable()
export class MqttService {
  private logger = new Logger(MqttService.name);
  private client: MqttClient;

  constructor(
    @InjectRepository(SensorData)
    private sensorDataRepository: Repository<SensorData>,
    @InjectRepository(Device)
    private deviceRepository: Repository<Device>,
    @InjectRepository(Dtu)
    private dtuRepository: Repository<Dtu>,
  ) {}

  async onModuleInit() {
    // 连接到MQTT代理
    this.client = connect(process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883', {
      username: process.env.MQTT_USERNAME,
      password: YOUR_PASSWORD,
      clientId: `iot_server_${Math.random().toString(16).substr(2, 8)}`,
    });

    this.client.on('connect', () => {
      this.logger.log('Connected to MQTT broker');
      
      // 订阅设备数据主题
      this.client.subscribe('device/+/data', (err) => {
        if (err) {
          this.logger.error('Failed to subscribe to device data topic', err);
        } else {
          this.logger.log('Subscribed to device data topics');
        }
      });

      // 订阅DTU心跳主题
      this.client.subscribe('dtu/+/heartbeat', (err) => {
        if (err) {
          this.logger.error('Failed to subscribe to heartbeat topic', err);
        } else {
          this.logger.log('Subscribed to heartbeat topics');
        }
      });
    });

    this.client.on('message', async (topic, message) => {
      try {
        this.logger.log(`Received message on topic: ${topic}`);
        
        if (topic.startsWith('device/')) {
          await this.handleDeviceData(topic, message.toString());
        } else if (topic.startsWith('dtu/')) {
          await this.handleHeartbeat(topic, message.toString());
        }
      } catch (error) {
        this.logger.error('Error processing MQTT message', error);
      }
    });

    this.client.on('error', (error) => {
      this.logger.error('MQTT client error', error);
    });
  }

  private async handleDeviceData(topic: string, message: string) {
    try {
      // 解析主题获取设备ID
      const deviceId = parseInt(topic.split('/')[1]);
      if (isNaN(deviceId)) {
        this.logger.warn(`Invalid device ID in topic: ${topic}`);
        return;
      }

      // 解析消息
      let data;
      try {
        data = JSON.parse(message);
      } catch (parseError) {
        this.logger.error(`Failed to parse JSON message: ${message}`, parseError);
        return;
      }

      // 获取设备信息
      const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
      if (!device) {
        this.logger.warn(`Device not found: ${deviceId}`);
        return;
      }

      // 获取DTU信息
      const dtu = await this.dtuRepository.findOne({ where: { device_id: deviceId } });
      if (!dtu) {
        this.logger.warn(`DTU not found for device: ${deviceId}`);
        return;
      }

      // 存储原始数据
      for (const [dataType, value] of Object.entries(data)) {
        const sensorData = new SensorData();
        sensorData.device_id = device.id;
        sensorData.dtu_id = dtu.id;
        sensorData.data_timestamp = new Date();
        sensorData.data_type = dataType;
        sensorData.raw_value = typeof value === 'object' ? JSON.stringify(value) : String(value);
        sensorData.processed_value = typeof value === 'number' ? value : null;
        sensorData.quality_score = 1.0; // 初始质量评分为1.0

        await this.sensorDataRepository.save(sensorData);
      }

      this.logger.log(`Stored sensor data for device ${deviceId}`);
    } catch (error) {
      this.logger.error('Error handling device data', error);
    }
  }

  private async handleHeartbeat(topic: string, message: string) {
    try {
      // 解析主题获取DTU ID
      const dtuId = parseInt(topic.split('/')[1]);
      if (isNaN(dtuId)) {
        this.logger.warn(`Invalid DTU ID in topic: ${topic}`);
        return;
      }

      // 更新DTU心跳时间
      await this.dtuRepository.update(dtuId, {
        communication_status: 'online',
        last_heartbeat: new Date(),
      });

      this.logger.log(`Updated heartbeat for DTU ${dtuId}`);
    } catch (error) {
      this.logger.error('Error handling heartbeat', error);
    }
  }

  async publishMessage(topic: string, message: string) {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, message, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(true);
        }
      });
    });
  }

  async onModuleDestroy() {
    if (this.client && this.client.connected) {
      this.client.end();
    }
  }
}