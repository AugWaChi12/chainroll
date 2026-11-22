import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from '../components/badge'
import { Button } from '../components/button'
import { EmptyState, ErrorState, Kbd, Skeleton } from '../components/feedback'
import { FilmStrip, FrameCounter, RebateLabel, TxHash } from '../components/film'
import { KPIGrid, KPIStat } from '../components/kpi-stat'

const meta = { title: 'Overview/Film & Feedback', parameters: { layout: 'padded' } } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>

const HASH = '0x3f9a1c22e8b04d7a6c55e1f0a9b3d2c4e7f8a1b2c3d4e5f60718293a4b5ca91c'

export const FilmElements: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-6">
        <FrameCounter used={7} total={24} />
        <FrameCounter used={22} total={24} />
        <RebateLabel>07A</RebateLabel>
        <RebateLabel>KUB 400 · 24 EXP</RebateLabel>
      </div>
      <TxHash hash={HASH} explorerUrl="https://www.bkcscan.com/tx/" />
      <div className="flex flex-wrap gap-2">
        {(['neutral', 'success', 'warning', 'danger', 'info', 'frame'] as const).map((tone) => (
          <Badge key={tone} tone={tone} dot>
            {tone}
          </Badge>
        ))}
      </div>
      <FilmStrip />
      <div data-mode="analog" className="grain flex items-center gap-6 bg-bg p-6 text-fg">
        <FrameCounter used={12} total={24} />
        <RebateLabel>analog mode</RebateLabel>
      </div>
    </div>
  ),
}

export const KPIs: Story = {
  render: () => (
    <KPIGrid>
      <KPIStat
        label="แชะวันนี้"
        value="12,480"
        delta={0.124}
        hint="เทียบเมื่อวาน"
        trend={[6, 7, 6.8, 8, 10, 11, 12.5]}
      />
      <KPIStat
        label="tx ไม่สำเร็จ"
        value="37"
        delta={0.08}
        higherIsBetter={false}
        trend={[52, 48, 41, 44, 30, 34, 37]}
      />
      <KPIStat
        label="ผู้ใช้ active"
        value="1,906"
        delta={0.041}
        trend={[1.2, 1.4, 1.5, 1.5, 1.7, 1.8, 1.9]}
      />
      <KPIStat label="รายงานรอตรวจ" value="7" hint="ต้องตรวจภายใน 24 ชม." tone="danger" />
    </KPIGrid>
  ),
}

export const States: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-24 w-full" />
      </div>
      <EmptyState
        title="ยังไม่มีม้วน"
        description="รับม้วนฟรีวันนี้ แล้วเริ่มถ่ายได้เลย"
        action={<Button variant="primary">รับม้วนฟรี</Button>}
      />
      <ErrorState
        title="บันทึกลงเชนไม่สำเร็จ"
        description="gas ในกระเป๋าไม่พอ — รูปยังอยู่ในเครื่อง ลองใหม่ได้โดยไม่ต้องถ่ายใหม่"
        errorId="E-SHOOT-7F3A"
        onRetry={() => {}}
      />
      <p className="text-sm text-fg-muted">
        กด <Kbd>J</Kbd> <Kbd>K</Kbd> เพื่อเลื่อน, <Kbd>A</Kbd> อนุมัติ, <Kbd>H</Kbd> ซ่อน
      </p>
    </div>
  ),
}
