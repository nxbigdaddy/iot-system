import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByUsername(username);
    if (user && await bcrypt.compare(pass, user.password_hash)) {
      const { password_hash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { 
      username: user.username, 
      sub: user.id, 
      tenantId: user.tenant_id,
      role: user.role
    };
    
    // 生成访问令牌和刷新令牌
    const accessToken = YOUR_SECRET, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign(
      { ...payload, tokenType: 'refresh' }, 
      { expiresIn: '7d' }
    );

    return {
      access_token: YOUR_SECRET,
      refresh_token: YOUR_SECRET,
      user: {
        id: user.id,
        username: user.username,
        tenant_id: user.tenant_id,
        role: user.role
      }
    };
  }

  async register(userData: any) {
    // 密码加密
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(userData.password, saltRounds);
    
    // 创建用户
    const newUser = await this.usersService.create({
      ...userData,
      password_hash: hashedPassword
    });

    return this.login(newUser);
  }
}