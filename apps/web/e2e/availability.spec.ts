import { expect, test, type Page } from '@playwright/test'

async function signInWithBusiness(page: Page) {
  await page.goto('/dev/sign-in')
  await page
    .getByLabel('Email')
    .fill(`sched-${Date.now()}-${Math.random()}@example.test`)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/onboarding$/)
  await page.getByLabel('Business name').fill('Salon')
  await page.getByLabel('Booking page address').fill(`salon-${Date.now()}`)
  await page.getByRole('button', { name: 'Create business' }).click()
  await expect(page).toHaveURL(/\/availability$/)
}

async function pickDate(page: Page, monthsAhead: number, label: string) {
  for (let i = 0; i < monthsAhead; i++)
    await page.getByRole('button', { name: 'Go to the Next Month' }).click()
  await page.getByRole('gridcell', { name: label, exact: true }).click()
}

test('weekly hours, overrides and a second schedule persist', async ({
  page,
}) => {
  await signInWithBusiness(page)
  const save = page.getByRole('button', { name: 'Save changes' })

  // Thursday with a lunch gap, Saturday opened, Monday closed.
  await page.getByLabel('Thursday end', { exact: true }).fill('12:30 PM')
  await page
    .getByRole('button', { name: 'Add another time range for Thursday' })
    .click()
  await page.getByLabel('Thursday range 2 start').fill('1:30 PM')
  await page.getByLabel('Thursday range 2 end').fill('8 PM')
  await page.getByRole('switch', { name: 'Saturday' }).click()
  await page.getByLabel('Saturday start').fill('10:00 AM')
  await page.getByLabel('Saturday end').fill('3 PM')
  await page.getByRole('switch', { name: 'Monday' }).click()
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()

  // An inline error beside the row, and nothing saved while it is wrong.
  await page.getByLabel('Thursday range 2 start').fill('11:00 AM')
  await expect(page.getByText('Time ranges overlap')).toBeVisible()
  await save.click()
  await expect(page.getByText('Fix the highlighted problems')).toBeVisible()
  await page.getByLabel('Thursday range 2 start').fill('1:30 PM')
  await expect(page.getByText('Time ranges overlap')).toBeHidden()

  // Three kinds of override: short day, closed, extra day.
  const addOverride = async (
    monthsAhead: number,
    label: string,
    hours?: [string, string],
  ) => {
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await pickDate(page, monthsAhead, label)
    if (hours) {
      await page.getByLabel('Closed all day').click()
      await page.getByLabel('Override start').fill(hours[0])
      await page.getByLabel('Override end').fill(hours[1])
    }
    await page.getByRole('button', { name: 'Add override' }).click()
  }
  // Far enough ahead to always be in the future: 13 months out.
  const target = new Date()
  target.setMonth(target.getMonth() + 13, 1)
  const dayLabel = (day: number) => {
    const d = new Date(target.getFullYear(), target.getMonth(), day)
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }
  // Find a Wednesday (open, short day), a Sunday (closed, extra day) and a Tuesday (closed override).
  const dayOf = (weekday: number) => {
    for (let day = 1; day < 29; day++)
      if (
        new Date(target.getFullYear(), target.getMonth(), day).getDay() ===
        weekday
      )
        return day
    throw new Error('no such day')
  }
  const wed = dayOf(3)
  const sun = dayOf(0)
  const tue = dayOf(2)
  await addOverride(13, dayLabel(wed), ['9:00 AM', '1:00 PM'])
  await expect(page.getByText('Short day')).toBeVisible()
  await addOverride(13, dayLabel(tue))
  await expect(page.getByText('Closed all day')).toBeVisible()
  await addOverride(13, dayLabel(sun), ['10:00 AM', '4:00 PM'])
  await expect(page.getByText('Extra day')).toBeVisible()
  await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible()

  await save.click()
  await expect(page.getByText('Availability saved.').first()).toBeVisible()
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeHidden()

  // A second schedule, renamed, with its own hours.
  await page.getByRole('button', { name: 'New schedule' }).click()
  await expect(page.getByRole('tab', { name: 'New schedule' })).toBeVisible()
  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Late nights')
  await page.getByRole('button', { name: 'Rename', exact: true }).last().click()
  await page.getByLabel('Tuesday start').fill('5 PM')
  await page.getByLabel('Tuesday end').fill('11 PM')
  await save.click()
  await expect(page.getByText('Availability saved.').first()).toBeVisible()

  // Reload: everything is still there.
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Late nights' })).toBeVisible()
  await page.getByRole('tab', { name: 'Late nights' }).click()
  await expect(page.getByLabel('Tuesday start')).toHaveValue('5:00 PM')
  await page.getByRole('tab', { name: 'Working hours' }).click()
  await expect(page.getByLabel('Thursday range 1 end')).toHaveValue('12:30 PM')
  await expect(page.getByLabel('Thursday range 2 start')).toHaveValue('1:30 PM')
  await expect(page.getByLabel('Thursday range 2 end')).toHaveValue('8:00 PM')
  await expect(page.getByLabel('Saturday start')).toHaveValue('10:00 AM')
  await expect(page.getByLabel('Saturday end')).toHaveValue('3:00 PM')
  await expect(page.getByRole('switch', { name: 'Monday' })).not.toBeChecked()
  await expect(page.getByText('Short day')).toBeVisible()
  await expect(page.getByText('Extra day')).toBeVisible()
  await expect(page.getByText('Closed all day')).toBeVisible()

  // The last schedule cannot be deleted; a second one can.
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete schedule' }).click()
  await expect(page.getByRole('tab', { name: 'Working hours' })).toBeHidden()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Delete schedule' }).click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'at least one schedule' }),
  ).toBeVisible()
})
