import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type DemoStorySeed = {
  id: string
  projectId: string
  title: string
  description?: string
  status: 'waiting' | 'in_progress' | 'completed'
  priority: 'low' | 'med' | 'high' | 'urgent'
  assignee: string
}

const PROJECTS = [
  {
    id: 'demo-calc',
    name: 'Demo: Scientific Calculator',
    description: 'HTML/CSS/JS responsive mobile-first calculator',
  },
  {
    id: 'demo-weather',
    name: 'Demo: CLI Weather App',
    description: 'CLI weather app with current + 5-day forecast and ANSI colors',
  },
]

const STORIES: DemoStorySeed[] = [
  {
    id: 'demo-calc-1',
    projectId: 'demo-calc',
    title: '[DEMO-CALC] UI shell (mobile-first responsive)',
    status: 'in_progress',
    priority: 'high',
    assignee: 'You',
  },
  {
    id: 'demo-calc-2',
    projectId: 'demo-calc',
    title: '[DEMO-CALC] Arithmetic + scientific operations',
    status: 'waiting',
    priority: 'high',
    assignee: 'Claudio',
  },
  {
    id: 'demo-calc-3',
    projectId: 'demo-calc',
    title: '[DEMO-CALC] QA + edge cases',
    status: 'completed',
    priority: 'med',
    assignee: 'You',
  },
  {
    id: 'demo-weather-1',
    projectId: 'demo-weather',
    title: '[DEMO-WEATHER] CLI architecture + command plan',
    status: 'in_progress',
    priority: 'high',
    assignee: 'You',
  },
  {
    id: 'demo-weather-2',
    projectId: 'demo-weather',
    title: '[DEMO-WEATHER] Fetch current + 5-day forecast',
    status: 'waiting',
    priority: 'high',
    assignee: 'Claudio',
  },
  {
    id: 'demo-weather-3',
    projectId: 'demo-weather',
    title: '[DEMO-WEATHER] ANSI colorized output polish',
    status: 'completed',
    priority: 'med',
    assignee: 'You',
  },
]

const DEPENDENCIES: Array<{ storyId: string; dependsOnStoryId: string }> = [
  { storyId: 'demo-calc-2', dependsOnStoryId: 'demo-calc-1' },
  { storyId: 'demo-calc-3', dependsOnStoryId: 'demo-calc-2' },
  { storyId: 'demo-weather-2', dependsOnStoryId: 'demo-weather-1' },
  { storyId: 'demo-weather-3', dependsOnStoryId: 'demo-weather-2' },
]

const LABELS: Array<{ storyId: string; label: string }> = [
  { storyId: 'demo-calc-1', label: 'demo' },
  { storyId: 'demo-calc-1', label: 'frontend' },
  { storyId: 'demo-calc-2', label: 'math-engine' },
  { storyId: 'demo-calc-3', label: 'testing' },
  { storyId: 'demo-weather-1', label: 'demo' },
  { storyId: 'demo-weather-2', label: 'api-integration' },
  { storyId: 'demo-weather-3', label: 'ansi-colors' },
]

async function main() {
  await prisma.project.upsert({ where: { id: 'core' }, update: {}, create: { id: 'core', name: 'Core / Other' } })

  for (const project of PROJECTS) {
    await prisma.project.upsert({
      where: { id: project.id },
      update: { name: project.name, description: project.description },
      create: project,
    })
  }

  for (const story of STORIES) {
    await prisma.story.upsert({
      where: { id: story.id },
      update: {
        projectId: story.projectId,
        title: story.title,
        description: story.description,
        status: story.status,
        priority: story.priority,
        assignee: story.assignee,
      },
      create: {
        ...story,
        blocked: false,
      },
    })
  }

  for (const dep of DEPENDENCIES) {
    await prisma.storyDependency.upsert({
      where: { storyId_dependsOnStoryId: dep },
      update: {},
      create: {
        ...dep,
        type: 'blocks',
      },
    })
  }

  for (const label of LABELS) {
    await prisma.storyLabel.upsert({
      where: { storyId_label: label },
      update: {},
      create: label,
    })
  }

  for (const story of STORIES) {
    const deps = await prisma.storyDependency.findMany({
      where: { storyId: story.id },
      include: { dependsOn: { select: { status: true } } },
    })
    const blocked = deps.some((d) => d.dependsOn.status !== 'completed')
    await prisma.story.update({ where: { id: story.id }, data: { blocked } })
  }

  const hasCalcNote = await prisma.storyNote.findFirst({ where: { storyId: 'demo-calc-1', body: { contains: 'mobile-first' } } })
  if (!hasCalcNote) {
    await prisma.storyNote.create({
      data: {
        storyId: 'demo-calc-1',
        author: 'You',
        kind: 'note',
        body: 'Kickoff note: prioritize mobile-first layout and scientific key accessibility.',
      },
    })
  }

  const hasWeatherNote = await prisma.storyNote.findFirst({ where: { storyId: 'demo-weather-1', body: { contains: 'Open-Meteo' } } })
  if (!hasWeatherNote) {
    await prisma.storyNote.create({
      data: {
        storyId: 'demo-weather-1',
        author: 'Claudio',
        kind: 'note',
        body: 'Use Open-Meteo endpoint and normalize units before ANSI color formatting.',
      },
    })
  }

  const hasCalcFile = await prisma.fileAsset.findFirst({ where: { storyId: 'demo-calc-1', filename: 'calculator-spec.md' } })
  if (!hasCalcFile) {
    await prisma.fileAsset.create({
      data: {
        projectId: 'demo-calc',
        storyId: 'demo-calc-1',
        filename: 'calculator-spec.md',
        contentType: 'text/markdown',
        byteSize: 240,
        filePath: 'files/demo-calc/project-level/calculator-spec.md',
        textContent: 'Calculator spec with responsive layout and scientific operations.',
        summary: 'Responsive calculator spec and operation requirements.',
        uploadedBy: 'You',
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
