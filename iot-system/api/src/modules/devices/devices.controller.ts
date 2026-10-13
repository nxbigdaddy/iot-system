import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { DevicesService } from './devices.service';

@ApiTags('devices')
@Controller('api/devices')
@UseGuards(AuthGuard('jwt'))
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @ApiOperation({ summary: '获取设备列表' })
  @ApiResponse({ status: 200, description: '成功获取设备列表' })
  async findAll(@Req() req, @Query() query) {
    const tenantId = req.user.tenant_id;
    return await this.devicesService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个设备信息' })
  @ApiResponse({ status: 200, description: '成功获取设备信息' })
  @ApiResponse({ status: 404, description: '设备未找到' })
  async findOne(@Param('id') id: number, @Req() req) {
    const tenantId = req.user.tenant_id;
    return await this.devicesService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: '创建新设备' })
  @ApiResponse({ status: 201, description: '成功创建设备' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async create(@Body() createDeviceDto: any, @Req() req) {
    const tenantId = req.user.tenant_id;
    return await this.devicesService.create({ ...createDeviceDto, tenant_id: tenantId });
  }

  @Put(':id')
  @ApiOperation({ summary: '更新设备信息' })
  @ApiResponse({ status: 200, description: '成功更新设备' })
  @ApiResponse({ status: 404, description: '设备未找到' })
  async update(@Param('id') id: number, @Body() updateDeviceDto: any, @Req() req) {
    const tenantId = req.user.tenant_id;
    return await this.devicesService.update(id, updateDeviceDto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除设备' })
  @ApiResponse({ status: 200, description: '成功删除设备' })
  @ApiResponse({ status: 404, description: '设备未找到' })
  async remove(@Param('id') id: number, @Req() req) {
    const tenantId = req.user.tenant_id;
    return await this.devicesService.remove(id, tenantId);
  }

  @Get(':id/status')
  @ApiOperation({ summary: '获取设备实时状态' })
  @ApiResponse({ status: 200, description: '成功获取设备状态' })
  async getStatus(@Param('id') id: number) {
    return await this.devicesService.getDeviceStatus(id);
  }

  @Get(':id/runtime')
  @ApiOperation({ summary: '获取设备运行时间' })
  @ApiResponse({ status: 200, description: '成功获取设备运行时间' })
  async getRuntime(@Param('id') id: number) {
    return await this.devicesService.getDeviceRuntime(id);
  }
}