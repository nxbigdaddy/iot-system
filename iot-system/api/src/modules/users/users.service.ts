import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findOneByUsername(username: string): Promise<User | undefined> {
    return this.usersRepository.findOne({ 
      where: { username, status: 'active' },
      relations: ['tenant']
    });
  }

  async findOneById(id: number): Promise<User | undefined> {
    return this.usersRepository.findOne({ 
      where: { id, status: 'active' },
      relations: ['tenant']
    });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  async findByTenant(tenantId: number): Promise<User[]> {
    return this.usersRepository.find({ 
      where: { tenant_id: tenantId, status: 'active' },
      order: { created_at: 'DESC' }
    });
  }

  async update(id: number, userData: Partial<User>): Promise<User> {
    await this.usersRepository.update(id, userData);
    return this.findOneById(id);
  }

  async delete(id: number): Promise<void> {
    await this.usersRepository.update(id, { status: 'inactive' });
  }

  // 检查用户是否有权限访问指定租户的资源
  async hasTenantAccess(userId: number, tenantId: number): Promise<boolean> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, tenant_id: tenantId, status: 'active' }
    });
    return !!user;
  }

  // 根据角色检查权限
  async hasRole(userId: number, requiredRole: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, status: 'active' }
    });
    
    if (!user) return false;
    
    // 角色权限检查：admin > operator > readonly
    const roleHierarchy = {
      'admin': 3,
      'operator': 2,
      'readonly': 1
    };
    
    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  }
}