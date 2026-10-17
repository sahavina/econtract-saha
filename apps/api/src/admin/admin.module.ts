import { Module } from '@nestjs/common';
import { ContractTypesController, OrgController, RolesController, UsersController } from './admin.controller.js';
import { ContractTypesService } from './contract-types.service.js';
import { OrgService } from './org.service.js';
import { RolesService } from './roles.service.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, OrgController, RolesController, ContractTypesController],
  providers: [UsersService, OrgService, RolesService, ContractTypesService],
})
export class AdminModule {}
