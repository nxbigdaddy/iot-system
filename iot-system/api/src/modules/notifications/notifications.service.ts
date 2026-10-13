import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class NotificationService {
  private logger = new Logger(NotificationService.name);

  // 发送企业微信通知
  async sendWeChatNotification(user: any, title: string, message: string) {
    try {
      // 企业微信机器人Webhook URL（需要从配置中获取）
      const webhookUrl = process.env.WECHAT_WEBHOOK_URL;
      
      if (!webhookUrl) {
        this.logger.warn('WECHAT_WEBHOOK_URL not configured');
        return;
      }

      const payload = {
        msgtype: 'text',
        text: {
          content: `${title}\n\n${message}\n\n请及时处理！`,
          mentioned_list: [user.username] // 提及用户
        }
      };

      await axios.post(webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      this.logger.log(`WeChat notification sent to ${user.username}`);
    } catch (error) {
      this.logger.error(`Failed to send WeChat notification: ${error.message}`);
      throw error;
    }
  }

  // 发送邮件通知
  async sendEmailNotification(to: string, subject: string, body: string) {
    try {
      // 使用邮件服务发送邮件（这里以SendGrid为例）
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      const msg = {
        to,
        from: process.env.FROM_EMAIL || 'noreply@iot-system.com',
        subject,
        text: body,
        html: `<div><p>${body.replace(/\n/g, '<br>')}</p></div>`
      };

      await sgMail.send(msg);
      this.logger.log(`Email notification sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email notification: ${error.message}`);
      throw error;
    }
  }

  // 发送短信通知
  async sendSmsNotification(phoneNumber: string, message: string) {
    try {
      // 使用短信服务发送短信（这里以阿里云短信服务为例）
      const Core = require('@alicloud/pop-core');
      
      const client = new Core({
        accessKeyId: process.env.ALIBABA_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIBABA_ACCESS_KEY_SECRET,
        endpoint: 'https://dysmsapi.aliyuncs.com',
        apiVersion: '2017-05-25'
      });

      const params = {
        PhoneNumbers: phoneNumber,
        SignName: process.env.SMS_SIGN_NAME || 'IoT系统',
        TemplateCode: process.env.SMS_TEMPLATE_CODE || 'SMS_XXXXX',
        TemplateParam: JSON.stringify({ message })
      };

      const requestOption = {
        method: 'POST'
      };

      await client.request('SendSms', params, requestOption);
      this.logger.log(`SMS notification sent to ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`Failed to send SMS notification: ${error.message}`);
      throw error;
    }
  }

  // 发送语音通知
  async sendVoiceNotification(phoneNumber: string, message: string) {
    try {
      // 使用语音服务发送语音通知（这里以腾讯云语音通知为例）
      const tencentcloud = require('tencentcloud-sdk-nodejs');
      const TtsClient = tencentcloud.tts.v20190823.Client;
      
      const clientConfig = {
        credential: {
          secretId: process.env.TENCENT_SECRET_ID,
          secretKey: YOUR_SECRET,
        },
        region: process.env.TENCENT_REGION || 'ap-beijing',
        profile: { httpProfile: { endpoint: 'tts.tencentcloudapi.com' } }
      };

      const client = new TtsClient(clientConfig);
      
      // 将文本转换为语音并拨打
      const params = {
        Text: message,
        SessionId: `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };

      // 注意：这只是一个概念示例，实际实现可能需要使用语音通话API
      this.logger.log(`Voice notification prepared for ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`Failed to prepare voice notification: ${error.message}`);
      throw error;
    }
  }

  // 获取通知历史
  async getNotificationHistory(alarmId: number) {
    // 这里应该查询数据库中的通知记录
    // 实现将依赖于具体的数据库结构
    return [];
  }

  // 通知渠道可用性检查
  async checkChannelAvailability(channel: string): Promise<boolean> {
    switch (channel) {
      case 'wechat':
        return !!process.env.WECHAT_WEBHOOK_URL;
      case 'email':
        return !!process.env.SENDGRID_API_KEY;
      case 'sms':
        return !!(process.env.ALIBABA_ACCESS_KEY_ID && process.env.ALIBABA_ACCESS_KEY_SECRET);
      case 'voice':
        return !!(process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY);
      default:
        return false;
    }
  }

  // 批量发送通知
  async sendBulkNotifications(notifications: Array<{
    channel: string;
    recipient: string;
    title: string;
    message: string;
  }>) {
    const results = [];

    for (const notification of notifications) {
      try {
        let result;
        
        switch (notification.channel) {
          case 'wechat':
            result = await this.sendWeChatNotification(
              { username: notification.recipient }, 
              notification.title, 
              notification.message
            );
            break;
          case 'email':
            result = await this.sendEmailNotification(
              notification.recipient,
              notification.title,
              notification.message
            );
            break;
          case 'sms':
            result = await this.sendSmsNotification(
              notification.recipient,
              notification.message
            );
            break;
          default:
            throw new Error(`Unsupported notification channel: ${notification.channel}`);
        }

        results.push({ 
          recipient: notification.recipient, 
          success: true, 
          channel: notification.channel 
        });
      } catch (error) {
        this.logger.error(`Failed to send notification to ${notification.recipient}: ${error.message}`);
        results.push({ 
          recipient: notification.recipient, 
          success: false, 
          channel: notification.channel,
          error: error.message 
        });
      }
    }

    return results;
  }
}