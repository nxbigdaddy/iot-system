import { Entity, Column, PrimaryGeneratedColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Device } from '../../devices/entities/device.entity';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  contact_person: string;

  @Column({ nullable: true })
  contact_email: string;

  @Column({ nullable: true })
  contact_phone: string;

  @Column({ type: 'date', nullable: true })
  contract_start_date: Date;

  @Column({ type: 'date', nullable: true })
  contract_end_date: Date;

  @Column({ default: 0 })
  max_devices: number;

  @Column({ default: 'active' })
  status: string;

  @OneToMany(() => User, user => user.tenant)
  users: User[];

  @OneToMany(() => Device, device => device.tenant)
  devices: Device[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}