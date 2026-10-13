import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Alarm } from './entities/alarm.entity';
import { AlarmRule } from '../alarm-rules/entities/alarm-rule.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { Device } from '../devices/entities/device.entity';
import { NotificationService } from '../notifications/notifications.service';

export interface AlarmCondition {
  type: 'threshold' | 'rate_change' | 'combination';
  threshold_value?: number;
  threshold_operator?: string; // >, >=, <, <=, !=
  rate_threshold?: number; // 变化率阈值
  conditions?: AlarmCondition[]; // 组合条件
}

@Injectable()
export class AlarmsService {
  private logger = new Logger(AlarmsService.name);

  constructor(
    @InjectRepository(Alarm)
    private alarmsRepository: Repository<Alarm>,
    @InjectRepository(AlarmRule)
    private alarmRulesRepository: Repository<AlarmRule>,
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Device)
    private devicesRepository: Repository<Device>,
    private notificationService: NotificationService,
  ) {}

  // 检查数据是否触发报警规则
  async checkAlarmConditions(deviceId: number, dataType: string, value: number, timestamp: Date) {
    // 获取设备相关的激活报警规则
    const activeRules = await this.alarmRulesRepository.find({
      where: {
        device_id: deviceId,
        data_type: dataType,
        enabled: true
      }
    });

    for (const rule of activeRules) {
      const shouldTrigger = this.evaluateCondition(rule, value);
      
      if (shouldTrigger) {
        await this.triggerAlarm(rule, deviceId, value, timestamp);
      }
    }
  }

  // 评估报警条件
  private evaluateCondition(rule: AlarmRule, currentValue: number): boolean {
    if (rule.condition_type === 'threshold') {
      // 阈值条件判断
      switch (rule.threshold_operator) {
        case '>':
          return currentValue > rule.threshold_value;
        case '>=':
          return currentValue >= rule.threshold_value;
        case '<':
          return currentValue < rule.threshold_value;
        case '<=':
          return currentValue <= rule.threshold_value;
        case '!=':
          return currentValue !== rule.threshold_value;
        default:
          return false;
      }
    }
    
    // 其他条件类型可在此处扩展
    return false;
  }

  // 触发报警
  private async triggerAlarm(rule: AlarmRule, deviceId: number, actualValue: number, timestamp: Date) {
    // 检查是否已有相同未解决的报警
    const existingOpenAlarm = await this.alarmsRepository.findOne({
      where: {
        rule_id: rule.id,
        device_id: deviceId,
        status: 'open'
      }
    });

    if (existingOpenAlarm) {
      // 如果有相同的未解决报警，则不重复触发
      return;
    }

    // 创建新的报警记录
    const alarm = new Alarm();
    alarm.rule_id = rule.id;
    alarm.device_id = deviceId;
    alarm.data_type = rule.data_type;
    alarm.actual_value = actualValue;
    alarm.threshold_value = rule.threshold_value;
    alarm.alert_level = rule.alert_level;
    alarm.status = 'open';
    alarm.created_at = timestamp;
    alarm.updated_at = timestamp;

    const savedAlarm = await this.alarmsRepository.save(alarm);

    // 发送通知
    await this.sendAlarmNotifications(savedAlarm);

    this.logger.log(`Alarm triggered: Rule ${rule.id}, Device ${deviceId}, Value ${actualValue}`);
  }

  // 发送报警通知
  private async sendAlarmNotifications(alarm: Alarm) {
    // 获取设备关联的租户
    const device = await this.devicesRepository.findOne({ 
      where: { id: alarm.device_id },
      relations: ['tenant']
    });

    if (!device) {
      this.logger.error(`Device ${alarm.device_id} not found`);
      return;
    }

    // 获取租户下的相关人员（根据报警级别决定通知对象）
    let usersToNotify: User[];
    if (alarm.alert_level === 'critical') {
      // 紧急报警通知管理员
      usersToNotify = await this.usersRepository.find({
        where: { 
          tenant_id: device.tenant_id,
          role: 'admin'
        }
      });
    } else {
      // 一般报警通知操作员和管理员
      usersToNotify = await this.usersRepository.find({
        where: { 
          tenant_id: device.tenant_id,
          role: 'IN (\'admin\', \'operator\')'
        }
      });
    }

    // 发送各种类型的通知
    for (const user of usersToNotify) {
      try {
        // 企业微信通知
        await this.notificationService.sendWeChatNotification(
          user,
          `设备报警: ${device.name} (${alarm.data_type})`,
          `设备 ${device.name} 的 ${alarm.data_type} 值为 ${alarm.actual_value}，超过阈值 ${alarm.threshold_value}`
        );

        // 邮件通知
        await this.notificationService.sendEmailNotification(
          user.email,
          `设备报警 - ${device.name}`,
          `设备 ${device.name} 发生 ${alarm.alert_level} 级别报警\n\n` +
          `数据类型: ${alarm.data_type}\n` +
          `当前值: ${alarm.actual_value}\n` +
          `阈值: ${alarm.threshold_value}\n` +
          `发生时间: ${alarm.created_at}\n\n` +
          `请及时处理！`
        );

        // 保存通知记录
        const notification = new Notification();
        notification.alarm_id = alarm.id;
        notification.notification_type = 'email';
        notification.recipient = user.email;
        notification.message_content = `设备报警 - ${device.name}`;
        notification.sent_at = new Date();
        notification.delivery_status = 'sent';

        await this.notificationsRepository.save(notification);
      } catch (error) {
        this.logger.error(`Failed to send notification to user ${user.id}: ${error.message}`);
        
        // 保存失败通知记录
        const notification = new Notification();
        notification.alarm_id = alarm.id;
        notification.notification_type = 'email';
        notification.recipient = user.email;
        notification.message_content = `设备报警 - ${device.name}`;
        notification.sent_at = new Date();
        notification.delivery_status = 'failed';

        await this.notificationsRepository.save(notification);
      }
    }
  }

  // 获取报警列表
  async getAlarms(tenantId: number, filters: {
    status?: string;
    alertLevel?: string;
    deviceId?: number;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}) {
    const queryBuilder = this.alarmsRepository.createQueryBuilder('alarm')
      .leftJoinAndSelect('alarm.rule', 'rule')
      .leftJoinAndSelect('alarm.device', 'device')
      .leftJoinAndSelect('device.tenant', 'tenant')
      .where('tenant.id = :tenantId', { tenantId });

    if (filters.status) {
      queryBuilder.andWhere('alarm.status = :status', { status: filters.status });
    }
    
    if (filters.alertLevel) {
      queryBuilder.andWhere('alarm.alert_level = :alertLevel', { alertLevel: filters.alertLevel });
    }
    
    if (filters.deviceId) {
      queryBuilder.andWhere('alarm.device_id = :deviceId', { deviceId: filters.deviceId });
    }
    
    if (filters.dateFrom) {
      queryBuilder.andWhere('alarm.created_at >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    
    if (filters.dateTo) {
      queryBuilder.andWhere('alarm.created_at <= :dateTo', { dateTo: filters.dateTo });
    }

    queryBuilder.orderBy('alarm.created_at', 'DESC');

    return await queryBuilder.getMany();
  }

  // 获取报警统计
  async getAlarmStats(tenantId: number, daysBack: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // 总报警数
    const totalAlarms = await this.alarmsRepository.count({
      where: {
        device: { tenant_id: tenantId },
        created_at: Between(startDate, new Date())
      }
    });

    // 按级别统计
    const levelStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select(['alarm.alert_level as level', 'COUNT(*) as count'])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy('alarm.alert_level')
      .getRawMany();

    // 按状态统计
    const statusStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select(['alarm.status as status', 'COUNT(*) as count'])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy('alarm.status')
      .getRawMany();

    // 今日报警数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayAlarms = await this.alarmsRepository.count({
      where: {
        device: { tenant_id: tenantId },
        created_at: Between(today, tomorrow)
      }
    });

    return {
      total: totalAlarms,
      today: todayAlarms,
      by_level: levelStats,
      by_status: statusStats
    };
  }

  // 确认报警
  async acknowledgeAlarm(alarmId: number, userId: number) {
    const alarm = await this.alarmsRepository.findOne({ where: { id: alarmId } });
    
    if (!alarm) {
      throw new Error('Alarm not found');
    }

    alarm.status = 'acknowledged';
    alarm.acknowledged_at = new Date();
    alarm.acknowledged_by = userId;

    return await this.alarmsRepository.save(alarm);
  }

  // 解决报警
  async resolveAlarm(alarmId: number, userId: number, resolutionNotes?: string) {
    const alarm = await this.alarmsRepository.findOne({ where: { id: alarmId } });
    
    if (!alarm) {
      throw new Error('Alarm not found');
    }

    alarm.status = 'resolved';
    alarm.resolved_at = new Date();
    alarm.resolved_by = userId;
    if (resolutionNotes) {
      alarm.resolution_notes = resolutionNotes;
    }

    return await this.alarmsRepository.save(alarm);
  }

  // 创建报警规则
  async createAlarmRule(ruleData: Partial<AlarmRule>) {
    const rule = this.alarmRulesRepository.create(ruleData);
    return await this.alarmRulesRepository.save(rule);
  }

  // 更新报警规则
  async updateAlarmRule(ruleId: number, ruleData: Partial<AlarmRule>) {
    await this.alarmRulesRepository.update(ruleId, ruleData);
    return await this.alarmRulesRepository.findOne({ where: { id: ruleId } });
  }

  // 删除报警规则
  async deleteAlarmRule(ruleId: number) {
    await this.alarmRulesRepository.update(ruleId, { enabled: false });
    return { success: true };
  }
}