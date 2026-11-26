import { expect, test } from '@playwright/test'

type Tool = {
  name: string
  execute: (input: object) => Promise<unknown>
}

declare global {
  interface Window {
    agentToolsForTest: Map<string, Tool>
  }
}

test('WebMCP edits an ordinary field, redacts its value and refuses a settings change', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const tools = new Map<string, Tool>()
    window.agentToolsForTest = tools
    Object.defineProperty(document, 'modelContext', {
      value: {
        async registerTool(tool: Tool) {
          tools.set(tool.name, tool)
        },
        async unregisterTool(name: string) {
          tools.delete(name)
        },
      },
    })
  })
  await page.goto('/dev/tokens')
  await expect
    .poll(() => page.evaluate(() => window.agentToolsForTest.size))
    .toBe(3)
  const run = (name: string, input: object) =>
    page.evaluate(
      async ({ name, input }) => {
        const tool = window.agentToolsForTest.get(name)
        if (!tool) throw new Error('Missing WebMCP tool: ' + name)
        return JSON.stringify(await tool.execute(input))
      },
      { name, input },
    )
  const edit = (ref: string, action: string, value: string | boolean) =>
    run('act', { steps: [{ ref, action, args: [value] }] })
  await edit('Name', 'setValue', 'private search')
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(
    'private search',
  )
  const snapshot = await run('snapshot', {})
  expect(snapshot).toContain('[redacted]')
  expect(snapshot).not.toContain('private search')
  await edit('Booking status', 'setValue', 'past')
  await expect(page.getByRole('tab', { name: 'Past' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(JSON.parse(await edit('Paused', 'setChecked', true))).toMatchObject({
    ok: false,
    error: { step: 0 },
  })
  await expect(page.getByRole('switch', { name: 'Paused' })).not.toBeChecked()

  await page.goto('/dev/sign-in')
  await expect
    .poll(() => page.evaluate(() => window.agentToolsForTest.size))
    .toBe(3)
  expect(JSON.parse(await run('snapshot', {}))).toEqual([])
})
