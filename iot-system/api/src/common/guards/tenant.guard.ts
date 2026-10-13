import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { UsersService } from '../../modules/users/users.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.params.tenantId || request.body.tenantId || request.query.tenantId;

    if (!tenantId) {
      return false;
    }

    // 检查用户是否属于该租户
    return this.usersService.hasTenantAccess(user.id, Number(tenantId));
  }
}