import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Material } from './entities/material.entity';
import { WorkOrderMaterial } from '../work-order-materials/entities/work-order-material.entity';
import { ERPIntegrationService } from './erp-integration.service';

@Injectable()
export class MaterialsService {
  private logger = new Logger(MaterialsService.name);

  constructor(
    @InjectRepository(Material)
    private materialsRepository: Repository<Material>,
    @InjectRepository(WorkOrderMaterial)
    private workOrderMaterialsRepository: Repository<WorkOrderMaterial>,
    private erpIntegrationService: ERPIntegrationService,
  ) {}

  // 获取物料列表
  async findAll(tenantId: number) {
    return this.materialsRepository.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' }
    });
  }

  // 获取单个物料
  async findOne(id: number, tenantId: number) {
    return this.materialsRepository.findOne({
      where: { id, tenant_id: tenantId }
    });
  }

  // 创建物料
  async create(materialData: Partial<Material>) {
    const material = this.materialsRepository.create(materialData);
    const savedMaterial = await this.materialsRepository.save(material);

    // 同步到ERP系统
    try {
      await this.erpIntegrationService.syncMaterialToERP(savedMaterial);
    } catch (error) {
      this.logger.error(`Failed to sync material to ERP: ${error.message}`);
      // 记录错误但不影响本地创建
    }

    return savedMaterial;
  }

  // 更新物料
  async update(id: number, materialData: Partial<Material>, tenantId: number) {
    const existingMaterial = await this.materialsRepository.findOne({
      where: { id, tenant_id: tenantId }
    });

    if (!existingMaterial) {
      throw new Error('Material not found or unauthorized');
    }

    await this.materialsRepository.update(id, materialData);
    const updatedMaterial = await this.findOne(id, tenantId);

    // 同步更新到ERP系统
    try {
      await this.erpIntegrationService.updateMaterialInERP(updatedMaterial);
    } catch (error) {
      this.logger.error(`Failed to update material in ERP: ${error.message}`);
    }

    return updatedMaterial;
  }

  // 删除物料
  async remove(id: number, tenantId: number) {
    const existingMaterial = await this.materialsRepository.findOne({
      where: { id, tenant_id: tenantId }
    });

    if (!existingMaterial) {
      throw new Error('Material not found or unauthorized');
    }

    // 检查物料是否被工单使用
    const usageCount = await this.workOrderMaterialsRepository.count({
      where: { material_id: id }
    });

    if (usageCount > 0) {
      // 如果已被使用，标记为停用而不是物理删除
      await this.materialsRepository.update(id, { status: 'inactive' });
    } else {
      // 没有使用记录，可以安全删除
      await this.materialsRepository.delete(id);
    }

    // 同步删除到ERP系统
    try {
      await this.erpIntegrationService.deleteMaterialFromERP(id);
    } catch (error) {
      this.logger.error(`Failed to delete material from ERP: ${error.message}`);
    }

    return { success: true };
  }

  // 获取物料库存统计
  async getInventoryStats(tenantId: number) {
    const materials = await this.materialsRepository.find({
      where: { tenant_id: tenantId }
    });

    const totalItems = materials.length;
    const totalStock = materials.reduce((sum, m) => sum + (m.current_stock || 0), 0);
    const lowStockItems = materials.filter(m => 
      m.current_stock <= (m.min_stock || 0)
    ).length;

    return {
      total_items: totalItems,
      total_stock_value: materials.reduce((sum, m) => 
        sum + ((m.current_stock || 0) * (m.unit_price || 0)), 0),
      low_stock_items: lowStockItems,
      out_of_stock_items: materials.filter(m => (m.current_stock || 0) === 0).length
    };
  }

  // 更新库存
  async updateStock(materialId: number, quantity: number, tenantId: number, operation: 'add' | 'subtract' = 'subtract') {
    const material = await this.materialsRepository.findOne({
      where: { id: materialId, tenant_id: tenantId }
    });

    if (!material) {
      throw new Error('Material not found or unauthorized');
    }

    let newQuantity: number;
    if (operation === 'add') {
      newQuantity = (material.current_stock || 0) + quantity;
    } else {
      newQuantity = Math.max(0, (material.current_stock || 0) - quantity);
    }

    await this.materialsRepository.update(materialId, { 
      current_stock: newQuantity,
      updated_at: new Date()
    });

    // 同步库存变更到ERP系统
    try {
      await this.erpIntegrationService.updateStockInERP(materialId, newQuantity);
    } catch (error) {
      this.logger.error(`Failed to update stock in ERP: ${error.message}`);
    }

    // 检查是否低于最小库存
    if (newQuantity < (material.min_stock || 0)) {
      this.logger.warn(`Material ${material.name} stock is low: ${newQuantity}`);
      // 这里可以触发补货通知
    }

    return await this.findOne(materialId, tenantId);
  }

  // 批量更新库存
  async batchUpdateStock(updates: Array<{materialId: number, quantity: number, operation: 'add' | 'subtract'}>, tenantId: number) {
    const results = [];
    
    for (const update of updates) {
      try {
        const result = await this.updateStock(update.materialId, update.quantity, tenantId, update.operation);
        results.push({ 
          material_id: update.materialId, 
          success: true, 
          new_stock: result.current_stock 
        });
      } catch (error) {
        results.push({ 
          material_id: update.materialId, 
          success: false, 
          error: error.message 
        });
      }
    }

    return results;
  }

  // 获取低库存警告
  async getLowStockWarnings(tenantId: number) {
    const materials = await this.materialsRepository.find({
      where: { 
        tenant_id: tenantId,
        status: 'active'
      }
    });

    return materials
      .filter(m => (m.current_stock || 0) <= (m.min_stock || 0))
      .map(m => ({
        id: m.id,
        name: m.name,
        current_stock: m.current_stock,
        min_stock: m.min_stock,
        is_out_of_stock: (m.current_stock || 0) === 0
      }));
  }

  // 从ERP系统同步物料数据
  async syncFromERP(tenantId: number) {
    try {
      const erpMaterials = await this.erpIntegrationService.fetchMaterialsFromERP(tenantId);
      
      for (const erpData of erpMaterials) {
        // 检查本地是否存在
        const existing = await this.materialsRepository.findOne({
          where: { 
            tenant_id: tenantId, 
            material_code: erpData.material_code 
          }
        });

        if (existing) {
          // 更新现有物料
          await this.materialsRepository.update(existing.id, {
            name: erpData.name,
            description: erpData.description,
            unit: erpData.unit,
            unit_price: erpData.unit_price,
            current_stock: erpData.current_stock,
            min_stock: erpData.min_stock,
            supplier: erpData.supplier
          });
        } else {
          // 创建新物料
          const newMaterial = this.materialsRepository.create({
            tenant_id: tenantId,
            material_code: erpData.material_code,
            name: erpData.name,
            description: erpData.description,
            unit: erpData.unit,
            unit_price: erpData.unit_price,
            current_stock: erpData.current_stock,
            min_stock: erpData.min_stock,
            supplier: erpData.supplier,
            status: 'active'
          });
          
          await this.materialsRepository.save(newMaterial);
        }
      }

      return { success: true, synced_count: erpMaterials.length };
    } catch (error) {
      this.logger.error(`Failed to sync materials from ERP: ${error.message}`);
      throw error;
    }
  }
}