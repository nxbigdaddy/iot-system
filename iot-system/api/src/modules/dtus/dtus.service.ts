import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dtu } from './entities/dtu.entity';
import { SimCard } from '../sim-cards/entities/sim-card.entity';

@Injectable()
export class DtusService {
  constructor(
    @InjectRepository(Dtu)
    private dtusRepository: Repository<Dtu>,
    @InjectRepository(SimCard)
    private simCardsRepository: Repository<SimCard>,
  ) {}

  async findAll() {
    return this.dtusRepository.find({
      order: { created_at: 'DESC' }
    });
  }

  async findOne(id: number) {
    return this.dtusRepository.findOne({
      where: { id },
      relations: ['simCards']
    });
  }

  async create(dtuData: Partial<Dtu>) {
    const dtu = this.dtusRepository.create(dtuData);
    return this.dtusRepository.save(dtu);
  }

  async update(id: number, dtuData: Partial<Dtu>) {
    await this.dtusRepository.update(id, dtuData);
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.dtusRepository.update(id, { activation_status: 'suspended' });
    return { success: true };
  }

  // 批量操作
  async batchUpdate(ids: number[], updateData: Partial<Dtu>) {
    await this.dtusRepository.update(ids, updateData);
    return { success: true, count: ids.length };
  }

  // 激活DTU
  async activateDtu(id: number) {
    await this.dtusRepository.update(id, { 
      activation_status: 'active',
      updated_at: new Date()
    });
    return this.findOne(id);
  }

  // 停用DTU
  async deactivateDtu(id: number) {
    await this.dtusRepository.update(id, { 
      activation_status: 'suspended',
      updated_at: new Date()
    });
    return this.findOne(id);
  }

  // 获取DTU状态统计
  async getStatusStats() {
    const totalDtus = await this.dtusRepository.count();
    const activeDtus = await this.dtusRepository.count({ where: { activation_status: 'active' } });
    const inactiveDtus = await this.dtusRepository.count({ where: { activation_status: 'inactive' } });
    const suspendedDtus = await this.dtusRepository.count({ where: { activation_status: 'suspended' } });

    return {
      total: totalDtus,
      active: activeDtus,
      inactive: inactiveDtus,
      suspended: suspendedDtus
    };
  }

  // 获取通信状态统计
  async getCommunicationStats() {
    const onlineDtus = await this.dtusRepository.count({ where: { communication_status: 'online' } });
    const offlineDtus = await this.dtusRepository.count({ where: { communication_status: 'offline' } });
    const errorDtus = await this.dtusRepository.count({ where: { communication_status: 'error' } });

    return {
      online: onlineDtus,
      offline: offlineDtus,
      error: errorDtus
    };
  }
}