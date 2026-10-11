import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfigService } from '../config/app-config.service.js';
import { buildDataSourceOptions } from './typeorm.options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        ...buildDataSourceOptions({
          DATABASE_URL: config.get('DATABASE_URL'),
          DATABASE_SSL: config.get('DATABASE_SSL'),
          DATABASE_LOGGING: config.get('DATABASE_LOGGING'),
        }),
        // Pending migrations run at boot, each in its own transaction.
        migrationsRun: true,
        migrationsTransactionMode: 'each',
      }),
    }),
  ],
})
export class DatabaseModule {}
