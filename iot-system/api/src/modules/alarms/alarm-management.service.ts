import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan, LessThan } from 'typeorm';
import { Alarm } from './entities/alarm.entity';
import { AlarmRule } from '../alarm-rules/entities/alarm-rule.entity';
import { Device } from '../devices/entities/device.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { NotificationService } from '../notifications/notifications.service';
import { DeviceMonitoringService } from '../devices/device-monitoring.service';

export interface AlarmCondition {
  type: 'threshold' | 'rate_change' | 'combination' | 'outlier_detection';
  threshold_value?: number;
  threshold_operator?: string; // >, >=, <, <=, !=, between
  rate_threshold?: number;
  outlier_threshold?: number; // 异常检测阈值
  conditions?: AlarmCondition[]; // 组合条件
}

export interface AlarmEvaluationResult {
  shouldTrigger: boolean;
  confidence: number;
  evaluationDetails: any;
}

@Injectable()
export class AlarmManagementService {
  private logger = new Logger(AlarmManagementService.name);

  constructor(
    @InjectRepository(Alarm)
    private alarmsRepository: Repository<Alarm>,
    @InjectRepository(AlarmRule)
    private alarmRulesRepository: Repository<AlarmRule>,
    @InjectRepository(Device)
    private devicesRepository: Repository<Device>,
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private notificationService: NotificationService,
    private deviceMonitoringService: DeviceMonitoringService,
  ) {}

  /**
   * 评估报警条件
   */
  async evaluateAlarmConditions(deviceId: number, dataType: string, value: number, timestamp: Date): Promise<AlarmEvaluationResult> {
    // 获取设备相关的激活报警规则
    const activeRules = await this.alarmRulesRepository.find({
      where: {
        device_id: deviceId,
        data_type: dataType,
        enabled: true
      }
    });

    if (activeRules.length === 0) {
      return {
        shouldTrigger: false,
        confidence: 1.0,
        evaluationDetails: { rulesChecked: 0 }
      };
    }

    for (const rule of activeRules) {
      const evaluation = this.evaluateSingleRule(rule, value);
      
      if (evaluation.shouldTrigger) {
        return {
          shouldTrigger: true,
          confidence: evaluation.confidence,
          evaluationDetails: {
            triggeringRule: rule.id,
            ruleName: rule.name,
            currentValue: value,
            thresholdValue: rule.threshold_value,
            operator: rule.threshold_operator
          }
        };
      }
    }

    return {
      shouldTrigger: false,
      confidence: 1.0,
      evaluationDetails: { rulesChecked: activeRules.length }
    };
  }

  /**
   * 评估单个规则
   */
  private evaluateSingleRule(rule: AlarmRule, currentValue: number): AlarmEvaluationResult {
    switch (rule.condition_type) {
      case 'threshold':
        return this.evaluateThresholdRule(rule, currentValue);
      case 'rate_change':
        return this.evaluateRateChangeRule(rule, currentValue);
      case 'outlier_detection':
        return this.evaluateOutlierRule(rule, currentValue);
      case 'combination':
        return this.evaluateCombinationRule(rule, currentValue);
      default:
        return { shouldTrigger: false, confidence: 0, evaluationDetails: {} };
    }
  }

  /**
   * 评估阈值规则
   */
  private evaluateThresholdRule(rule: AlarmRule, currentValue: number): AlarmEvaluationResult {
    let shouldTrigger = false;
    
    switch (rule.threshold_operator) {
      case '>':
        shouldTrigger = currentValue > rule.threshold_value;
        break;
      case '>=':
        shouldTrigger = currentValue >= rule.threshold_value;
        break;
      case '<':
        shouldTrigger = currentValue < rule.threshold_value;
        break;
      case '<=':
        shouldTrigger = currentValue <= rule.threshold_value;
        break;
      case '!=':
        shouldTrigger = currentValue !== rule.threshold_value;
        break;
      case 'between':
        if (rule.additional_params && rule.additional_params.upper_bound !== undefined) {
          shouldTrigger = currentValue >= rule.threshold_value && 
                         currentValue <= rule.additional_params.upper_bound;
        }
        break;
      default:
        shouldTrigger = false;
    }

    return {
      shouldTrigger,
      confidence: 1.0,
      evaluationDetails: {
        ruleType: 'threshold',
        currentValue,
        threshold: rule.threshold_value,
        operator: rule.threshold_operator
      }
    };
  }

  /**
   * 评估变化率规则
   */
  private async evaluateRateChangeRule(rule: AlarmRule, currentValue: number): Promise<AlarmEvaluationResult> {
    // 获取最近的历史数据来计算变化率
    const tenMinutesAgo = new Date();
    tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);

    const recentData = await this.alarmsRepository.query(`
      SELECT processed_value, data_timestamp 
      FROM sensor_data 
      WHERE device_id = $1 
        AND data_type = $2 
        AND data_timestamp >= $3 
      ORDER BY data_timestamp DESC 
      LIMIT 2
    `, [rule.device_id, rule.data_type, tenMinutesAgo]);

    if (recentData.length < 2) {
      return { shouldTrigger: false, confidence: 0.5, evaluationDetails: { reason: 'insufficient_data' } };
    }

    const previousValue = recentData[1].processed_value;
    const timeDiff = (new Date(recentData[0].data_timestamp).getTime() - new Date(recentData[1].data_timestamp).getTime()) / 1000; // 秒
    const rateOfChange = Math.abs(currentValue - previousValue) / (timeDiff / 60); // 每分钟变化

    const shouldTrigger = rateOfChange > rule.rate_threshold;
    
    return {
      shouldTrigger,
      confidence: shouldTrigger ? 0.8 : 0.9,
      evaluationDetails: {
        ruleType: 'rate_change',
        currentValue,
        previousValue,
        timeDiffSeconds: timeDiff,
        rateOfChange,
        threshold: rule.rate_threshold
      }
    };
  }

  /**
   * 评估异常检测规则
   */
  private async evaluateOutlierRule(rule: AlarmRule, currentValue: number): Promise<AlarmEvaluationResult> {
    // 获取历史数据来建立正常范围
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const historicalData = await this.alarmsRepository.query(`
      SELECT processed_value 
      FROM sensor_data 
      WHERE device_id = $1 
        AND data_type = $2 
        AND data_timestamp >= $3
        AND processed_value IS NOT NULL
      ORDER BY data_timestamp DESC
    `, [rule.device_id, rule.data_type, thirtyDaysAgo]);

    if (historicalData.length < 10) {
      return { shouldTrigger: false, confidence: 0.3, evaluationDetails: { reason: 'insufficient_historical_data' } };
    }

    // 计算统计值
    const values = historicalData.map(d => d.processed_value);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // 使用3σ原则检测异常
    const lowerBound = mean - (rule.outlier_threshold || 3) * stdDev;
    const upperBound = mean + (rule.outlier_threshold || 3) * stdDev;

    const isOutlier = currentValue < lowerBound || currentValue > upperBound;

    return {
      shouldTrigger: isOutlier,
      confidence: 0.8,
      evaluationDetails: {
        ruleType: 'outlier_detection',
        currentValue,
        mean,
        stdDev,
        lowerBound,
        upperBound,
        isOutlier
      }
    };
  }

  /**
   * 评估组合规则
   */
  private evaluateCombinationRule(rule: AlarmRule, currentValue: number): AlarmEvaluationResult {
    // 组合规则的评估逻辑
    // 这里简化处理，实际应该解析rule.conditions并递归评估
    return {
      shouldTrigger: false,
      confidence: 0.5,
      evaluationDetails: { ruleType: 'combination', reason: 'complex_evaluation_not_implemented' }
    };
  }

  /**
   * 触发报警
   */
  async triggerAlarm(ruleId: number, deviceId: number, actualValue: number, timestamp: Date) {
    // 检查是否已有相同未解决的报警
    const existingOpenAlarm = await this.alarmsRepository.findOne({
      where: {
        rule_id: ruleId,
        device_id: deviceId,
        status: 'open'
      }
    });

    if (existingOpenAlarm) {
      // 更新最后触发时间，避免重复报警
      existingOpenAlarm.last_triggered = timestamp;
      await this.alarmsRepository.save(existingOpenAlarm);
      return existingOpenAlarm;
    }

    // 创建新的报警记录
    const rule = await this.alarmRulesRepository.findOne({ where: { id: ruleId } });
    if (!rule) {
      throw new Error(`Alarm rule with id ${ruleId} not found`);
    }

    const alarm = new Alarm();
    alarm.rule_id = ruleId;
    alarm.device_id = deviceId;
    alarm.data_type = rule.data_type;
    alarm.actual_value = actualValue;
    alarm.threshold_value = rule.threshold_value;
    alarm.alert_level = rule.alert_level;
    alarm.status = 'open';
    alarm.created_at = timestamp;
    alarm.updated_at = timestamp;
    alarm.last_triggered = timestamp;

    const savedAlarm = await this.alarmsRepository.save(alarm);

    // 发送通知（异步执行）
    this.sendAlarmNotifications(savedAlarm).catch(error => {
      this.logger.error(`Failed to send notifications for alarm ${savedAlarm.id}: ${error.message}`);
    });

    // 记录到日志
    this.logger.log(`Alarm triggered: Rule ${ruleId}, Device ${deviceId}, Value ${actualValue}`);

    return savedAlarm;
  }

  /**
   * 发送报警通知
   */
  private async sendAlarmNotifications(alarm: Alarm) {
    // 获取设备关联的租户和相关用户
    const device = await this.devicesRepository.findOne({ 
      where: { id: alarm.device_id },
      relations: ['tenant']
    });

    if (!device) {
      this.logger.error(`Device ${alarm.device_id} not found for alarm ${alarm.id}`);
      return;
    }

    // 根据报警级别获取需要通知的用户
    let usersToNotify: User[];
    if (alarm.alert_level === 'critical') {
      // 紧急报警通知管理员和操作员
      usersToNotify = await this.usersRepository.find({
        where: { 
          tenant_id: device.tenant_id,
          role: 'IN (\'admin\', \'operator\')'
        }
      });
    } else {
      // 一般报警通知操作员
      usersToNotify = await this.usersRepository.find({
        where: { 
          tenant_id: device.tenant_id,
          role: 'operator'
        }
      });
    }

    // 发送多种渠道的通知
    const notificationPromises = usersToNotify.map(user => 
      this.sendNotificationToUser(user, alarm, device)
    );

    await Promise.allSettled(notificationPromises);
  }

  /**
   * 发送通知给单个用户
   */
  private async sendNotificationToUser(user: User, alarm: Alarm, device: Device) {
    const message = this.formatAlarmMessage(alarm, device);
    
    // 发送企业微信通知
    try {
      await this.notificationService.sendWeChatNotification(user, `设备报警: ${device.name}`, message);
    } catch (error) {
      this.logger.error(`Failed to send WeChat notification to user ${user.id}: ${error.message}`);
    }

    // 发送邮件通知
    try {
      await this.notificationService.sendEmailNotification(
        user.email,
        `设备报警 - ${device.name}`,
        message
      );
    } catch (error) {
      this.logger.error(`Failed to send email notification to user ${user.email}: ${error.message}`);
    }

    // 发送短信通知（如果是高优先级）
    if (alarm.alert_level === 'critical') {
      try {
        // 获取用户手机号（假设在用户表中有phone字段）
        // await this.notificationService.sendSmsNotification(user.phone, message);
      } catch (error) {
        this.logger.error(`Failed to send SMS notification: ${error.message}`);
      }
    }
  }

  /**
   * 格式化报警消息
   */
  private formatAlarmMessage(alarm: Alarm, device: Device): string {
    return `
设备: ${device.name}
类型: ${alarm.data_type}
级别: ${alarm.alert_level.toUpperCase()}
数值: ${alarm.actual_value}
阈值: ${alarm.threshold_value}
时间: ${alarm.created_at.toLocaleString()}

请及时处理！
    `.trim();
  }

  /**
   * 确认报警
   */
  async acknowledgeAlarm(alarmId: number, userId: number, acknowledgmentNote?: string) {
    const alarm = await this.alarmsRepository.findOne({ where: { id: alarmId } });
    
    if (!alarm) {
      throw new Error(`Alarm with id ${alarmId} not found`);
    }

    if (alarm.status !== 'open') {
      throw new Error(`Cannot acknowledge alarm with status: ${alarm.status}`);
    }

    alarm.status = 'acknowledged';
    alarm.acknowledged_at = new Date();
    alarm.acknowledged_by = userId;
    alarm.acknowledgment_note = acknowledgmentNote;

    const updatedAlarm = await this.alarmsRepository.save(alarm);

    // 记录操作日志
    this.logger.log(`Alarm ${alarmId} acknowledged by user ${userId}`);

    return updatedAlarm;
  }

  /**
   * 解决报警
   */
  async resolveAlarm(alarmId: number, userId: number, resolutionNotes?: string) {
    const alarm = await this.alarmsRepository.findOne({ where: { id: alarmId } });
    
    if (!alarm) {
      throw new Error(`Alarm with id ${alarmId} not found`);
    }

    if (!['open', 'acknowledged'].includes(alarm.status)) {
      throw new Error(`Cannot resolve alarm with status: ${alarm.status}`);
    }

    alarm.status = 'resolved';
    alarm.resolved_at = new Date();
    alarm.resolved_by = userId;
    alarm.resolution_notes = resolutionNotes;

    const updatedAlarm = await this.alarmsRepository.save(alarm);

    // 记录操作日志
    this.logger.log(`Alarm ${alarmId} resolved by user ${userId}`);

    return updatedAlarm;
  }

  /**
   * 关闭报警
   */
  async closeAlarm(alarmId: number, userId: number, closeReason?: string) {
    const alarm = await this.alarmsRepository.findOne({ where: { id: alarmId } });
    
    if (!alarm) {
      throw new Error(`Alarm with id ${alarmId} not found`);
    }

    if (alarm.status !== 'resolved') {
      throw new Error(`Cannot close unresolved alarm with status: ${alarm.status}`);
    }

    alarm.status = 'closed';
    alarm.closed_at = new Date();
    alarm.closed_by = userId;
    alarm.close_reason = closeReason;

    const updatedAlarm = await this.alarmsRepository.save(alarm);

    // 记录操作日志
    this.logger.log(`Alarm ${alarmId} closed by user ${userId}`);

    return updatedAlarm;
  }

  /**
   * 获取报警统计
   */
  async getAlarmStatistics(tenantId: number, daysBack: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // 总报警数
    const totalAlarms = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .getCount();

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

    // 按设备统计（Top 10）
    const deviceStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select(['alarm.device_id as deviceId', 'device.name as deviceName', 'COUNT(*) as count'])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy('alarm.device_id, device.name')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // 今日统计
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStats = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select([
        'COUNT(*) as totalCount',
        "COUNT(CASE WHEN alarm.alert_level = 'critical' THEN 1 END) as criticalCount",
        "COUNT(CASE WHEN alarm.alert_level = 'warning' THEN 1 END) as warningCount"
      ])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at BETWEEN :today AND :tomorrow', { today, tomorrow })
      .getRawOne();

    // 平均响应时间（从报警创建到确认的时间）
    const avgAckTime = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select('AVG(EXTRACT(EPOCH FROM (alarm.acknowledged_at - alarm.created_at))) as avg_seconds')
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.acknowledged_at IS NOT NULL')
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .getRawOne();

    // 平均解决时间（从报警创建到解决的时间）
    const avgResolutionTime = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select('AVG(EXTRACT(EPOCH FROM (alarm.resolved_at - alarm.created_at))) as avg_seconds')
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.resolved_at IS NOT NULL')
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .getRawOne();

    return {
      period: `${daysBack}天`,
      total: totalAlarms,
      today: {
        total: parseInt(todayStats.totalCount),
        critical: parseInt(todayStats.criticalCount),
        warning: parseInt(todayStats.warningCount)
      },
      byLevel: levelStats,
      byStatus: statusStats,
      byDevice: deviceStats,
      avgAcknowledgmentTimeMinutes: avgAckTime?.avg_seconds ? Math.round(parseFloat(avgAckTime.avg_seconds) / 60) : null,
      avgResolutionTimeMinutes: avgResolutionTime?.avg_seconds ? Math.round(parseFloat(avgResolutionTime.avg_seconds) / 60) : null
    };
  }

  /**
   * 获取报警趋势
   */
  async getAlarmTrends(tenantId: number, daysBack: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const trends = await this.alarmsRepository
      .createQueryBuilder('alarm')
      .select([
        "DATE(alarm.created_at) as date",
        "COUNT(*) as total",
        "COUNT(CASE WHEN alarm.alert_level = 'critical' THEN 1 END) as critical",
        "COUNT(CASE WHEN alarm.alert_level = 'warning' THEN 1 END) as warning",
        "COUNT(CASE WHEN alarm.alert_level = 'info' THEN 1 END) as info"
      ])
      .leftJoin('alarm.device', 'device')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.created_at >= :startDate', { startDate })
      .groupBy('DATE(alarm.created_at)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return trends.map(trend => ({
      date: trend.date,
      total: parseInt(trend.total),
      critical: parseInt(trend.critical),
      warning: parseInt(trend.warning),
      info: parseInt(trend.info)
    }));
  }

  /**
   * 获取未处理的报警
   */
  async getUnhandledAlarms(tenantId: number) {
    return await this.alarmsRepository
      .createQueryBuilder('alarm')
      .leftJoinAndSelect('alarm.device', 'device')
      .leftJoinAndSelect('alarm.rule', 'rule')
      .where('device.tenant_id = :tenantId', { tenantId })
      .andWhere('alarm.status IN (:...statuses)', { statuses: ['open', 'acknowledged'] })
      .orderBy('alarm.alert_level', 'DESC')
      .addOrderBy('alarm.created_at', 'DESC')
      .getMany();
  }

  /**
   * 批量处理报警
   */
  async batchProcessAlarms(alarmIds: number[], action: 'acknowledge' | 'resolve' | 'close', userId: number, notes?: string) {
    const results = [];
    
    for (const alarmId of alarmIds) {
      try {
        let result;
        
        switch (action) {
          case 'acknowledge':
            result = await this.acknowledgeAlarm(alarmId, userId, notes);
            break;
          case 'resolve':
            result = await this.resolveAlarm(alarmId, userId, notes);
            break;
          case 'close':
            result = await this.closeAlarm(alarmId, userId, notes);
            break;
          default:
            throw new Error(`Invalid action: ${action}`);
        }
        
        results.push({
          alarmId,
          success: true,
          action,
          result
        });
      } catch (error) {
        results.push({
          alarmId,
          success: false,
          action,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * 创建报警规则
   */
  async createAlarmRule(ruleData: Partial<AlarmRule>) {
    const rule = this.alarmRulesRepository.create(ruleData);
    return await this.alarmRulesRepository.save(rule);
  }

  /**
   * 更新报警规则
   */
  async updateAlarmRule(ruleId: number, ruleData: Partial<AlarmRule>) {
    await this.alarmRulesRepository.update(ruleId, ruleData);
    return await this.alarmRulesRepository.findOne({ where: { id: ruleId } });
  }

  /**
   * 删除报警规则
   */
  async deleteAlarmRule(ruleId: number) {
    await this.alarmRulesRepository.update(ruleId, { enabled: false });
    return { success: true };
  }
}