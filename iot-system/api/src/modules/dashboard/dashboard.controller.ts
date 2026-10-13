import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/rbac.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { AnalyticsService } from '../analytics/analytics.service';
import { DevicesService } from '../devices/devices.service';
import { SensorsService } from '../sensors/sensors.service';
import { AlarmsService } from '../alarms/alarms.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { PredictiveMaintenanceService } from '../predictive-maintenance/predictive-maintenance.service';

@Controller('api/dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(
    private analyticsService: AnalyticsService,
    private devicesService: DevicesService,
    private sensorsService: SensorsService,
    private alarmsService: AlarmsService,
    private workOrdersService: WorkOrdersService,
    private predictiveMaintenanceService: PredictiveMaintenanceService,
  ) {}

  @Get('overview')
  async getOverview(@Req() req) {
    const tenantId = req.user.tenant_id;
    return await this.analyticsService.getDashboardData(tenantId);
  }

  @Get('devices/:deviceId/telemetry')
  async getDeviceTelemetry(
    @Param('deviceId') deviceId: number,
    @Query('dataType') dataType: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('aggregation') aggregation: string
  ) {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 24 * 60 * 60 * 1000); // 默认过去24小时
    const end = endDate ? new Date(endDate) : new Date();
    
    return await this.analyticsService.getTimeSeriesData(
      deviceId,
      dataType || 'temperature',
      start,
      end,
      aggregation as any || 'raw'
    );
  }

  @Get('devices/:deviceId/health-trend')
  async getDeviceHealthTrend(
    @Param('deviceId') deviceId: number,
    @Query('days') days: number = 30
  ) {
    return await this.analyticsService.getDeviceHealthTrend(deviceId, days);
  }

  @Get('devices/stats')
  async getDeviceStats(@Req() req) {
    const tenantId = req.user.tenant_id;
    return await this.devicesService.getDeviceStats(tenantId);
  }

  @Get('alarms/stats')
  async getAlarmStats(
    @Req() req,
    @Query('days') days: number = 30
  ) {
    const tenantId = req.user.tenant_id;
    return await this.alarmsService.getAlarmStats(tenantId, days);
  }

  @Get('workorders/stats')
  async getWorkOrderStats(
    @Req() req,
    @Query('days') days: number = 30
  ) {
    const tenantId = req.user.tenant_id;
    return await this.workOrdersService.getWorkOrderStats(tenantId, days);
  }

  @Get('predictions/:deviceId')
  async getPrediction(@Param('deviceId') deviceId: number) {
    return await this.predictiveMaintenanceService.predictMaintenanceNeeds(deviceId);
  }
}