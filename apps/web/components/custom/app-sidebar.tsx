'use client'

import {
  Check,
  ChevronsUpDown,
  Clock,
  Code2,
  CalendarDays,
  List,
  LogOut,
  Plus,
  Settings,
  Tag,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Logo } from '@/components/custom/logo'
import { ThemeSwitcher } from '@/components/custom/theme-switcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { switchBusinessAction } from '@/app/actions/business'
import { signOut } from '@/lib/auth-client'

export type NavMeta = {
  /** A number shown at the right, for example upcoming bookings. */
  count?: number
  /** Shows a warning icon labelled "Needs attention". */
  attention?: boolean
}

type NavItem = { title: string; href: string; icon: LucideIcon }

const mainNav: NavItem[] = [
  { title: 'Bookings', href: '/', icon: List },
  { title: 'Services', href: '/services', icon: Tag },
  { title: 'Availability', href: '/availability', icon: Clock },
  { title: 'Calendars', href: '/calendars', icon: CalendarDays },
  { title: 'Developers', href: '/developers', icon: Code2 },
]
const businessNav: NavItem[] = [
  { title: 'Settings', href: '/settings', icon: Settings },
]

export type SidebarBusiness = { id: string; name: string }

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? '?'
  const last = parts[parts.length - 1] ?? first
  const letters =
    parts.length > 1 ? first.charAt(0) + last.charAt(0) : first.slice(0, 2)
  return letters.toUpperCase()
}

function BusinessAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 flex-none place-items-center rounded-[7px] bg-primary text-[11px] font-bold text-primary-foreground"
    >
      {initials(name)}
    </span>
  )
}

function NavLink({
  item,
  pathname,
  meta,
}: {
  item: NavItem
  pathname: string
  meta?: NavMeta
}) {
  const { setOpenMobile } = useSidebar()
  const active =
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        className="data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary data-[active=true]:hover:text-primary-foreground"
      >
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          onClick={() => setOpenMobile(false)}
        >
          <item.icon />
          <span>{item.title}</span>
          {meta?.attention ? (
            <TriangleAlert
              className="ml-auto"
              role="img"
              aria-label="Needs attention"
            />
          ) : meta?.count !== undefined ? (
            <span className="ml-auto font-mono text-[11px]">{meta.count}</span>
          ) : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar({
  businesses,
  currentId,
  user,
  navMeta = {},
}: {
  businesses: SidebarBusiness[]
  currentId: string
  user: { name: string; email: string }
  /** Counts and attention markers by nav title; later slices supply them. */
  navMeta?: Record<string, NavMeta>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [switching, startSwitch] = useTransition()
  const current = businesses.find((b) => b.id === currentId) ??
    businesses[0] ?? {
      id: currentId,
      name: 'Business',
    }

  async function handleSignOut() {
    await signOut({
      fetchOptions: { onSuccess: () => router.push('/login') },
    })
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-2 pt-1 pb-2">
          <Logo />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="h-auto border border-sidebar-border bg-card p-2"
                  aria-label={`Business: ${current.name}. Switch business`}
                >
                  <BusinessAvatar name={current.name} />
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate text-[13px] font-semibold">
                      {current.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {businesses.length}{' '}
                      {businesses.length === 1 ? 'business' : 'businesses'}
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
              >
                <DropdownMenuLabel>Your businesses</DropdownMenuLabel>
                {businesses.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    disabled={switching}
                    onSelect={() =>
                      startSwitch(() => switchBusinessAction(b.id))
                    }
                  >
                    <BusinessAvatar name={b.name} />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    {b.id === currentId ? (
                      <Check aria-label="Current business" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/onboarding">
                    <Plus /> Add a business
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  meta={navMeta[item.title]}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Business</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {businessNav.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  meta={navMeta[item.title]}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 border-t border-sidebar-border p-2 pt-3">
          <span
            aria-hidden="true"
            className="grid size-7 flex-none place-items-center rounded-full bg-primary-soft text-[11px] font-bold"
          >
            {initials(user.name || user.email)}
          </span>
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-[13px] font-semibold">
              {user.name || user.email}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {user.email}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 px-2 pb-1">
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <LogOut className="size-4" /> Sign out
          </button>
          <ThemeSwitcher />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
