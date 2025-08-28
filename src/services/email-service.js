const sgMail = require('@sendgrid/mail');

class EmailService {
  constructor() {
    this.isConfigured = false;
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@tripyy.com';
    this.fromName = process.env.SENDGRID_FROM_NAME || 'Tripyy Team';
    
    // Configure SendGrid if API key is available
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      this.isConfigured = true;
      console.log('✅ SendGrid configured successfully');
    } else {
      console.log('⚠️ SendGrid API key not found - emails will be logged only');
    }
  }

  // Send email verification
  async sendVerificationEmail(email, verificationToken, userName = '') {
    const subject = 'Verify Your Tripyy Account';
    
    // Check if we have a frontend URL for clickable links
    const hasFrontendUrl = process.env.FRONTEND_URL && process.env.FRONTEND_URL !== '';
    const verificationUrl = hasFrontendUrl 
      ? `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}&email=${encodeURIComponent(email)}`
      : null;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Tripyy Account</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .token-box { background: #e3f2fd; border: 2px solid #2196f3; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center; font-family: monospace; font-size: 16px; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🌟 Welcome to Tripyy!</h1>
            <p>Your adventure begins here</p>
          </div>
          <div class="content">
            <h2>Hi ${userName || 'there'}! 👋</h2>
            <p>Thank you for joining Tripyy! To complete your registration and start planning amazing trips, please verify your email address.</p>
            
            ${hasFrontendUrl ? `
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </div>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${verificationUrl}</p>
                               ` : `
                     <p><strong>Your 6-digit verification code:</strong></p>
                     <div class="token-box" style="font-size: 32px; font-weight: bold; text-align: center; background: #f0f0f0; padding: 20px; border-radius: 10px; letter-spacing: 5px; font-family: monospace;">${verificationToken}</div>
                     <p>Enter this code in the Tripyy app to verify your email address.</p>
                   `}
            
            <p><strong>This verification link will expire in 24 hours.</strong></p>
            
            <p>If you didn't create a Tripyy account, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2024 Tripyy. All rights reserved.</p>
            <p>This email was sent to ${email}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
      Welcome to Tripyy!
      
      Hi ${userName || 'there'}! Thank you for joining Tripyy! To complete your registration and start planning amazing trips, please verify your email address.
      
      ${hasFrontendUrl ? `Verify your email: ${verificationUrl}` : `Your verification token: ${verificationToken}`}
      
      This verification link will expire in 24 hours.
      
      If you didn't create a Tripyy account, you can safely ignore this email.
      
      © 2024 Tripyy. All rights reserved.
    `;

    return this.sendEmail(email, subject, htmlContent, textContent);
  }

  // Send welcome email
  async sendWelcomeEmail(email, userName = '') {
    const subject = 'Welcome to Tripyy! 🎉';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Tripyy!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .feature { background: white; padding: 20px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #667eea; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to Tripyy!</h1>
            <p>Your adventure begins now</p>
          </div>
          <div class="content">
            <h2>Hi ${userName || 'there'}! 👋</h2>
            <p>Congratulations! Your email has been verified and you're now part of the Tripyy community.</p>
            
            <h3>🚀 What you can do now:</h3>
            
            <div class="feature">
              <h4>🗺️ Plan Amazing Trips</h4>
              <p>Create detailed itineraries, add activities, and organize your travel plans.</p>
            </div>
            
            <div class="feature">
              <h4>📍 Discover POIs</h4>
              <p>Find and share interesting places with the community.</p>
            </div>
            
            <div class="feature">
              <h4>👥 Connect with Travelers</h4>
              <p>Join communities and make friends who share your passion for travel.</p>
            </div>
            
            <div class="feature">
              <h4>📱 Share Your Adventures</h4>
              <p>Post about your experiences and inspire others.</p>
            </div>
            
            <p><strong>Ready to start your journey?</strong> Open the Tripyy app and begin planning your next adventure!</p>
          </div>
          <div class="footer">
            <p>© 2024 Tripyy. All rights reserved.</p>
            <p>This email was sent to ${email}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
      Welcome to Tripyy!
      
      Hi ${userName || 'there'}! Congratulations! Your email has been verified and you're now part of the Tripyy community.
      
      What you can do now:
      
      🗺️ Plan Amazing Trips - Create detailed itineraries, add activities, and organize your travel plans.
      📍 Discover POIs - Find and share interesting places with the community.
      👥 Connect with Travelers - Join communities and make friends who share your passion for travel.
      📱 Share Your Adventures - Post about your experiences and inspire others.
      
      Ready to start your journey? Open the Tripyy app and begin planning your next adventure!
      
      © 2024 Tripyy. All rights reserved.
    `;

    return this.sendEmail(email, subject, htmlContent, textContent);
  }

  // Send password reset email
  async sendPasswordResetEmail(email, resetToken, userName = '') {
    const subject = 'Reset Your Tripyy Password';
    
    // Check if we have a frontend URL for clickable links
    const hasFrontendUrl = process.env.FRONTEND_URL && process.env.FRONTEND_URL !== '';
    const resetUrl = hasFrontendUrl 
      ? `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`
      : null;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Tripyy Password</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .token-box { background: #e3f2fd; border: 2px solid #2196f3; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center; font-family: monospace; font-size: 16px; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset Request</h1>
            <p>Tripyy Account Security</p>
          </div>
          <div class="content">
            <h2>Hi ${userName || 'there'}! 👋</h2>
            <p>We received a request to reset your Tripyy account password.</p>
            
            ${hasFrontendUrl ? `
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${resetUrl}</p>
            ` : `
              <p><strong>Your 6-digit reset code:</strong></p>
              <div class="token-box" style="font-size: 32px; font-weight: bold; text-align: center; background: #f0f0f0; padding: 20px; border-radius: 10px; letter-spacing: 5px; font-family: monospace;">${resetToken}</div>
              <p>Enter this code in the Tripyy app to reset your password.</p>
            `}
            
            <div class="warning">
              <p><strong>⚠️ Important:</strong></p>
              <ul>
                <li>This link will expire in 1 hour</li>
                <li>If you didn't request this reset, please ignore this email</li>
                <li>Your current password will remain unchanged</li>
              </ul>
            </div>
            
            <p>For security reasons, if you didn't request this password reset, please contact our support team immediately.</p>
          </div>
          <div class="footer">
            <p>© 2024 Tripyy. All rights reserved.</p>
            <p>This email was sent to ${email}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
      Password Reset Request - Tripyy Account Security
      
      Hi ${userName || 'there'}! We received a request to reset your Tripyy account password.
      
      ${hasFrontendUrl ? `Reset your password: ${resetUrl}` : `Your password reset token: ${resetToken}`}
      
      ⚠️ Important:
      - This link will expire in 1 hour
      - If you didn't request this reset, please ignore this email
      - Your current password will remain unchanged
      
      For security reasons, if you didn't request this password reset, please contact our support team immediately.
      
      © 2024 Tripyy. All rights reserved.
    `;

    return this.sendEmail(email, subject, htmlContent, textContent);
  }

  // Generic email sending method
  async sendEmail(to, subject, htmlContent, textContent) {
    const msg = {
      to,
      from: {
        email: this.fromEmail,
        name: this.fromName
      },
      subject,
      html: htmlContent,
      text: textContent
    };

    try {
      if (this.isConfigured) {
        // Send via SendGrid
        const response = await sgMail.send(msg);
        console.log(`✅ Email sent successfully to ${to}:`, response[0].statusCode);
        return { success: true, messageId: response[0].headers['x-message-id'] };
      } else {
        // Log email content for development/testing
        console.log('📧 [DEV MODE] Email would be sent:');
        console.log('   To:', to);
        console.log('   Subject:', subject);
        console.log('   Content preview:', textContent.substring(0, 100) + '...');
        return { success: true, messageId: 'dev-mode', devMode: true };
      }
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      if (error.response) {
        console.error('SendGrid error details:', error.response.body);
      }
      return { success: false, error: error.message };
    }
  }

  // Check if email service is properly configured
  isReady() {
    return this.isConfigured;
  }

  // Get configuration status
  getStatus() {
    return {
      configured: this.isConfigured,
      fromEmail: this.fromEmail,
      fromName: this.fromName,
      hasApiKey: !!process.env.SENDGRID_API_KEY,
      hasFrontendUrl: !!(process.env.FRONTEND_URL && process.env.FRONTEND_URL !== ''),
      frontendUrl: process.env.FRONTEND_URL || 'Not configured',
      mode: this.isConfigured ? 'production' : 'development'
    };
  }
}

module.exports = new EmailService();
