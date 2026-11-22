import type { Meta, StoryObj } from '@storybook/react-vite'
import { Search } from 'lucide-react'
import { Kbd } from '../components/feedback'
import { Input } from '../components/input'

const meta = {
  title: 'Primitives/Input',
  component: Input,
  args: { label: 'ชื่อม้วนฟิล์ม', placeholder: 'เช่น Night 800' },
  decorators: [(Story) => <div className="max-w-sm">{Story()}</div>],
} satisfies Meta<typeof Input>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithHint: Story = { args: { hint: 'แสดงบนหน้ากล้องและขอบฟิล์ม' } }
export const WithError: Story = { args: { defaultValue: 'x', error: 'ชื่อต้องยาวอย่างน้อย 3 ตัวอักษร' } }
export const Search_: Story = {
  name: 'Search',
  args: {
    label: undefined,
    'aria-label': 'ค้นหา',
    placeholder: 'ค้นหา address, โพสต์, tx…',
    leading: <Search />,
    trailing: <Kbd>/</Kbd>,
  },
}
export const Disabled: Story = { args: { disabled: true, defaultValue: 'KUB 400' } }
