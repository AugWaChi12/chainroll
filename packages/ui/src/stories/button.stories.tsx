import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowRight, Fuel } from 'lucide-react'
import { Button } from '../components/button'

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'เปิดกล้อง' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'ghost', 'inverse', 'danger'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
  },
} satisfies Meta<typeof Button>
export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = { args: { variant: 'primary' } }
export const Secondary: Story = {}
export const Ghost: Story = { args: { variant: 'ghost', children: 'ยกเลิก' } }
export const Danger: Story = { args: { variant: 'danger', children: 'แบนผู้ใช้' } }
export const Disabled: Story = { args: { variant: 'primary', disabled: true } }

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-2">
          <Button size={size} variant="primary">
            เปิดกล้อง <ArrowRight />
          </Button>
          <Button size={size}>Export</Button>
          <Button size={size} variant="ghost">
            รีเฟรช
          </Button>
          <Button size={size} variant="inverse">
            ล้างฟิล์ม
          </Button>
          <Button size={size} variant="danger">
            <Fuel /> เติม KUB
          </Button>
        </div>
      ))}
    </div>
  ),
}
