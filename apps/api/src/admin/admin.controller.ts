import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSIONS } from '@saha/shared';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import {
  type ContractTypeCreate,
  contractTypeCreateSchema,
  ContractTypesService,
  type ContractTypeUpdate,
  contractTypeUpdateSchema,
} from './contract-types.service.js';
import {
  type BranchCreate,
  branchCreateSchema,
  type BranchUpdate,
  branchUpdateSchema,
  type DepartmentCreate,
  departmentCreateSchema,
  type DepartmentUpdate,
  departmentUpdateSchema,
  OrgService,
} from './org.service.js';
import { type RoleCreate, roleCreateSchema, RolesService, type RoleUpdate, roleUpdateSchema } from './roles.service.js';
import {
  type ChangePassword,
  changePasswordSchema,
  resetPasswordSchema,
  type UserCreate,
  userCreateSchema,
  type UserQuery,
  userQuerySchema,
  UsersService,
  type UserUpdate,
  userUpdateSchema,
} from './users.service.js';

@ApiTags('Admin – Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER_VIEW)
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(userQuerySchema)) q: UserQuery) {
    return this.users.list(user, q);
  }

  /** Tự đổi mật khẩu: mọi người dùng đã đăng nhập. */
  @Post('me/password')
  @HttpCode(204)
  @RequireAnyPermission(...ALL_PERMISSIONS)
  changePassword(@CurrentUser() user: AuthUser, @Body(new ZodPipe(changePasswordSchema)) body: ChangePassword) {
    return this.users.changeOwnPassword(user, body);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER_VIEW)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(userCreateSchema)) body: UserCreate) {
    return this.users.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(userUpdateSchema)) body: UserUpdate,
  ) {
    return this.users.update(user, id, body);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(resetPasswordSchema)) body: z.infer<typeof resetPasswordSchema>,
  ) {
    return this.users.resetPassword(user, id, body.password);
  }
}

@ApiTags('Admin – Organization')
@ApiBearerAuth()
@Controller()
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get('departments')
  @RequireAnyPermission(PERMISSIONS.ORG_MANAGE, PERMISSIONS.USER_VIEW)
  departments(@CurrentUser() user: AuthUser) {
    return this.org.departments(user);
  }

  @Post('departments')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  createDepartment(@CurrentUser() user: AuthUser, @Body(new ZodPipe(departmentCreateSchema)) body: DepartmentCreate) {
    return this.org.createDepartment(user, body);
  }

  @Patch('departments/:id')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  updateDepartment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(departmentUpdateSchema)) body: DepartmentUpdate,
  ) {
    return this.org.updateDepartment(user, id, body);
  }

  @Get('branches')
  @RequireAnyPermission(PERMISSIONS.ORG_MANAGE, PERMISSIONS.USER_VIEW)
  branches(@CurrentUser() user: AuthUser) {
    return this.org.branches(user);
  }

  @Post('branches')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  createBranch(@CurrentUser() user: AuthUser, @Body(new ZodPipe(branchCreateSchema)) body: BranchCreate) {
    return this.org.createBranch(user, body);
  }

  @Patch('branches/:id')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  updateBranch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(branchUpdateSchema)) body: BranchUpdate,
  ) {
    return this.org.updateBranch(user, id, body);
  }
}

@ApiTags('Admin – Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequireAnyPermission(PERMISSIONS.ROLE_MANAGE, PERMISSIONS.USER_VIEW)
  list(@CurrentUser() user: AuthUser) {
    return this.roles.list(user);
  }

  /** Danh mục quyền để hiển thị ma trận phân quyền. */
  @Get('permissions')
  @RequireAnyPermission(PERMISSIONS.ROLE_MANAGE, PERMISSIONS.USER_VIEW)
  permissions() {
    return ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSION_LABELS[key] }));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(roleCreateSchema)) body: RoleCreate) {
    return this.roles.create(user, body);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(roleUpdateSchema)) body: RoleUpdate,
  ) {
    return this.roles.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.roles.remove(user, id);
  }
}

@ApiTags('Admin – Contract types')
@ApiBearerAuth()
@Controller('contract-types')
@RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
export class ContractTypesController {
  constructor(private readonly types: ContractTypesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.types.list(user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(contractTypeCreateSchema)) body: ContractTypeCreate) {
    return this.types.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(contractTypeUpdateSchema)) body: ContractTypeUpdate,
  ) {
    return this.types.update(user, id, body);
  }
}
