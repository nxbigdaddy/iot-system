import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Device } from './entities/device.entity';
import { Dtu } from '../dtus/entities/dtu.entity';
import { SimCard } from '../sim-cards/entities/sim-card.entity';

@Injectable()
export class DevicesService {
  constructor(
    @InjectRepository(Device)
    private devicesRepository: Repository<Device>,
    @InjectRepository(Dtu)
    private dtuRepository: Repository<Dtu>,
    @InjectRepository(SimCard)
    private simCardRepository: Repository<SimCard>,
  ) {}

  async findAll(tenantId: number) {
    return this.devicesRepository.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' }
    });
  }

  async findOne(id: number, tenantId: number) {
    return this.devicesRepository.findOne({
      where: { id, tenant_id: tenantId }
    });
  }

  async create(deviceData: Partial<Device>) {
    const device = this.devicesRepository.create(deviceData);
    return this.devicesRepository.save(device);
  }

  async update(id: number, deviceData: Partial<Device>, tenantId: number) {
    const existingDevice = await this.devicesRepository.findOne({
      where: { id, tenant_id: tenantId }
    });

    if (!existingDevice) {
      throw new Error('Device not found or unauthorized');
    }

    await this.devicesRepository.update(id, deviceData);
    return this.findOne(id, tenantId);
  }

  async remove(id: number, tenantId: number) {
    const existingDevice = await this.devicesRepository.findOne({
      where: { id, tenant_id: tenantId }
    });

    if (!existingDevice) {
      throw new Error('Device not found or unauthorized');
    }

    await this.devicesRepository.update(id, { status: 'decommissioned' });
    return { success: true };
  }

  // 获取设备实时状态
  async getDeviceStatus(deviceId: number) {
    const device = await this.devicesRepository.findOne({ where: { id: deviceId } });
    if (!device) {
      throw new Error('Device not found');
    }

    // 获取DTU状态
    const dtu = await this.dtuRepository.findOne({ where: { device_id: deviceId } });
    
    // 获取最新传感器数据
    const latestData = await this.devicesRepository.query(
      `SELECT * FROM sensor_data WHERE device_id = $1 ORDER BY data_timestamp DESC LIMIT 1`,
      [deviceId]
    );

    return {
      device: {
        id: device.id,
        name: device.name,
        status: device.status,
        location: device.location
      },
      connectivity: {
        dtu_status: dtu?.communication_status || 'unknown',
        last_heartbeat: dtu?.last_heartbeat || null
      },
      latest_data: latestData?.[0] || null
    };
  }

  // 获取设备统计数据
  async getDeviceStats(tenantId: number) {
    const totalDevices = await this.devicesRepository.count({ where: { tenant_id: tenantId } });
    const activeDevices = await this.devicesRepository.count({ 
      where: { tenant_id: tenantId, status: 'active' } 
    });
    const maintenanceDevices = await this.devicesRepository.count({ 
      where: { tenant_id: tenantId, status: 'maintenance' } 
    });

    return {
      total: totalDevices,
      active: activeDevices,
      maintenance: maintenanceDevices,
      decommissioned: totalDevices - activeDevices - maintenanceDevices
    };
  }

  // 获取设备运行时间
  async getDeviceRuntime(deviceId: number) {
    const device = await this.devicesRepository.findOne({ where: { id: deviceId } });
    if (!device || !device.installation_date) {
      return 0;
    }

    const now = new Date();
    const installDate = new Date(device.installation_date);
    const diffTime = Math.abs(now.getTime() - installDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }
}