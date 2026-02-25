import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.project.upsert({
    where: { id: 'core' },
    update: { name: 'Core / Other' },
    create: { id: 'core', name: 'Core / Other' },
  })

  const session = await prisma.agentSession.findUnique({ where: { id: 'agent-main' } })
  if (!session) {
    const now = new Date()
    await prisma.agentSession.create({
      data: {
        id: 'agent-main',
        projectId: 'core',
        title: 'Build Bolt milestones',
        state: 'coding',
        startedAt: new Date(now.getTime() - 1000 * 60 * 20),
        lastHeartbeatAt: now,
      },
    })

    await prisma.agentEvent.create({
      data: {
        sessionId: 'agent-main',
        type: 'status',
        message: 'Baseline seed initialized',
      },
    })
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
