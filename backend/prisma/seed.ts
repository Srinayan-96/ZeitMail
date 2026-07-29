import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.create({
    data: {
      email: 'test@reachinbox.ai',
      name: 'Test User',
      senders: {
        create: {
          id: 'sender-uuid-placeholder',
          email: 'sender@reachinbox.ai',
          smtpUser: 'ethereal_user_placeholder',
          smtpPass: 'ethereal_pass_placeholder'
        }
      }
    }
  });
  console.log('Created dummy user and sender:', user);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
