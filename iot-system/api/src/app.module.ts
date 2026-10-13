import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DevicesModule } from './modules/devices/devices.module';
import { DtuModule } from './modules/dtus/dtus.module';
import { SimCardsModule } from './modules/sim-cards/sim-cards.module';
import { SensorsModule } from './modules/sensors/sensors.module';
import { AlarmsModule } from './modules/alarms/alarms.module';
import { WorkOrdersModule } from './modules/work-orders/work-orders.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { PredictiveMaintenanceModule } from './modules/predictive-maintenance/predictive-maintenance.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      username: process.env.DB_USERNAME || 'postgres',
      password: YOUR_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'iot_system',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production', // 生产环境不要使用synchronize
      logging: process.env.NODE_ENV !== 'production',
    }),
    AuthModule,
    UsersModule,
    DevicesModule,
    DtuModule,
    SimCardsModule,
    SensorsModule,
    AlarmsModule,
    WorkOrdersModule,
    MaterialsModule,
    PredictiveMaintenanceModule,
    AnalyticsModule,
    DashboardModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}