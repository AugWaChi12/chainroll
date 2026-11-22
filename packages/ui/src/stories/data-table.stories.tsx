import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from '../components/badge'
import { Button } from '../components/button'
import { DataTable, type ColumnDef } from '../components/data-table'
import { TxHash, truncateHash } from '../components/film'

type User = {
  address: string
  handle: string
  shots: number
  streak: number
  status: 'active' | 'banned'
}

const users: User[] = Array.from({ length: 34 }, (_, i) => ({
  address: `0x${(i * 2654435761).toString(16).padStart(8, '0')}${'a3f9c2e1'.repeat(4)}`,
  handle: `${['ploy.shoots', 'bank_35mm', 'nong.film', 'tee.k', 'mint_roll', 'aom.grain'][i % 6] ?? 'user'}${i > 5 ? i : ''}`,
  shots: (i * 37) % 420,
  streak: (i * 7) % 30,
  status: i % 11 === 4 ? 'banned' : 'active',
}))

const columns: ColumnDef<User, unknown>[] = [
  { accessorKey: 'handle', header: 'ผู้ใช้' },
  {
    accessorKey: 'address',
    header: 'Address',
    cell: ({ getValue }) => <TxHash hash={String(getValue())} />,
  },
  {
    accessorKey: 'shots',
    header: 'แชะทั้งหมด',
    cell: ({ getValue }) => <span className="font-mono tabular">{Number(getValue())}</span>,
  },
  {
    accessorKey: 'streak',
    header: 'Streak',
    cell: ({ getValue }) => (
      <span className="font-mono tabular text-frame">{Number(getValue())} วัน</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'สถานะ',
    cell: ({ getValue }) =>
      getValue() === 'banned' ? (
        <Badge tone="danger" dot>
          แบน
        </Badge>
      ) : (
        <Badge tone="success" dot>
          ปกติ
        </Badge>
      ),
  },
]

const meta = {
  title: 'Data/DataTable',
  component: DataTable<User>,
  args: {
    columns,
    data: users,
    getRowId: (u: User) => u.address,
    pageSize: 10,
    searchPlaceholder: 'ค้นหาผู้ใช้หรือ address',
  },
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="p-6">{Story()}</div>],
} satisfies Meta<typeof DataTable<User>>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Selectable: Story = {
  args: {
    selectable: true,
    bulkActions: (selected: User[]) => (
      <Button variant="danger" size="sm">
        แบน {selected.length} คน
      </Button>
    ),
  },
}
export const Compact: Story = {
  decorators: [(Story) => <div data-density="compact">{Story()}</div>],
}
export const Loading: Story = { args: { loading: true } }
export const Empty: Story = {
  args: {
    data: [],
    emptyTitle: 'ยังไม่มีผู้ใช้',
    emptyDescription: 'ผู้ใช้จะขึ้นที่นี่หลังเชื่อมกระเป๋าครั้งแรก',
  },
}
export const RowClick: Story = {
  args: { onRowClick: (u: User) => alert(truncateHash(u.address)) },
}
