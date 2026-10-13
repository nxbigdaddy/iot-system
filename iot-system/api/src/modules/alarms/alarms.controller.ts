import { Controller, Get, Post, Put, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { AlarmsService } from './alarms.service';

@ApiTags('alarms')
@Controller('api/alarms')
@UseGuards(AuthGuard('jwt'))
export class AlarmsController {
  constructor(private readonly alarmsService: AlarmsService) {}

  @Get()
  @ApiOperation({ summary: '获取告警列表' })
  @ApiResponse({ status: 200, description: '成功获取告警列表' })
  async findAll(@Req() req, @Query() query) {
    const tenantId = req.user.tenant_id;
    return await this.alarmsService.getAlarms(tenantId, {
      status: query.status,
      alertLevel: query.alertLevel,
      deviceId: query.deviceId ? parseInt(query.deviceId) : undefined,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: '获取告警统计' })
  @ApiResponse({ status: 200, description: '成功获取告警统计' })
  async getStats(@Req() req, @Query('days') days: number = 30) {
    const tenantId = req.user.tenant_id;
    return await this.alarmsService.getAlarmStats(tenantId, days);
  }

  @Put(':id/acknowledge')
  @ApiOperation({ summary: '确认告警' })
  @ApiResponse({ status: 200, description: '成功确认告警' })
  async acknowledge(@Param('id') id: number, @Req() req) {
    return await this.alarmsService.acknowledgeAlarm(id, req.user.id);
  }

  @Put(':id/resolution')
  @ApiOperation({ summary: '解决告警' })
  @ApiResponse({ status: 200, description: '成功解决告警' })
  async resolve(@Param('id') id: number, @Body('resolutionNotes') resolutionNotes: string, @Req() req) {
    return await this.alarmsService.resolveAlarm(id, req.user.id, resolutionNotes);
  }
}