import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create a transporter using Ethereal SMTP
export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendEmail = async (to: string, subject: string, html: string, from?: string) => {
  try {
    const info = await transporter.sendMail({
      from: from || process.env.SMTP_FROM || '"ReachInbox Scheduler" <noreply@reachinbox.ai>',
      to,
      subject,
      html,
    });
    console.log(`Message sent: ${info.messageId}`);
    console.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
    return info;
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    throw error;
  }
};
