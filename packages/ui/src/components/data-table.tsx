'use client'

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { fmt, useUiLabels } from '../i18n'
import { cn } from '../lib/cn'
import { Button } from './button'
import { EmptyState, Skeleton } from './feedback'

export type { ColumnDef } from '@tanstack/react-table'

export type DataTableProps<T> = {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  /** Stable row id (address, uuid …) */
  getRowId: (row: T) => string
  loading?: boolean
  selectable?: boolean
  searchPlaceholder?: string
  /** Rendered in the bulk-action bar when rows are selected */
  bulkActions?: (selected: T[]) => ReactNode
  /** Rendered on the right of the toolbar */
  toolbar?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
  pageSize?: number
  onRowClick?: (row: T) => void
  className?: string
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  loading,
  selectable,
  searchPlaceholder,
  bulkActions,
  toolbar,
  emptyTitle,
  emptyDescription,
  pageSize = 20,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const L = useUiLabels()
  const searchLabel = searchPlaceholder ?? L.search
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const allColumns: ColumnDef<T, unknown>[] = selectable
    ? [
        {
          id: '__select',
          size: 36,
          enableSorting: false,
          header: ({ table }) => (
            <input
              type="checkbox"
              aria-label={L.selectAll}
              className="size-3.5 accent-[var(--accent)]"
              checked={table.getIsAllPageRowsSelected()}
              ref={(el) => {
                if (el) el.indeterminate = table.getIsSomePageRowsSelected()
              }}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
            />
          ),
          cell: ({ row }) => (
            <input
              type="checkbox"
              aria-label={L.selectRow}
              className="size-3.5 accent-[var(--accent)]"
              checked={row.getIsSelected()}
              onClick={(e) => e.stopPropagation()}
              onChange={row.getToggleSelectedHandler()}
            />
          ),
        },
        ...columns,
      ]
    : columns

  // TanStack Table returns non-memoizable functions; opt out of the React Compiler lint here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const selected = table.getSelectedRowModel().rows.map((r) => r.original)
  const rows = table.getRowModel().rows
  const { pageIndex } = table.getState().pagination
  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <div className={cn('flex flex-col border border-border bg-bg-raised', className)}>
      {/* toolbar */}
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {selected.length > 0 && bulkActions ? (
          <div className="flex flex-1 items-center gap-3">
            <span className="font-mono text-xs tabular text-fg">
              {fmt(L.selected, { count: selected.length })}
            </span>
            {bulkActions(selected)}
            <Button variant="ghost" size="sm" onClick={() => table.resetRowSelection()}>
              {L.cancel}
            </Button>
          </div>
        ) : (
          <label className="flex h-8 flex-1 items-center gap-2 text-sm sm:max-w-72">
            <Search className="size-4 text-fg-subtle" aria-hidden />
            <input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchLabel}
              aria-label={searchLabel}
              className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle"
            />
          </label>
        )}
        {toolbar}
      </div>

      {/* table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((header) => {
                  const sortable = header.column.getCanSort()
                  const dir = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      style={{ width: header.column.columnDef.size }}
                      aria-sort={
                        dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined
                      }
                      className="h-9 px-3 text-left text-2xs font-medium uppercase tracking-wider whitespace-nowrap text-fg-subtle"
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 uppercase hover:text-fg"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {dir === 'asc' && <ArrowUp className="size-3" />}
                          {dir === 'desc' && <ArrowDown className="size-3" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr
                    key={i}
                    className="border-b border-border last:border-0"
                    style={{ height: 'var(--row-h)' }}
                  >
                    {allColumns.map((_c, j) => (
                      <td key={j} className="px-3">
                        <Skeleton className="h-3.5 w-full max-w-32" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      'border-b border-border transition-colors duration-[var(--dur-fast)] last:border-0',
                      'hover:bg-bg-sunken/60 data-[state=selected]:bg-bg-sunken',
                      onRowClick && 'cursor-pointer',
                    )}
                    style={{ height: 'var(--row-h)' }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 whitespace-nowrap text-fg">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <EmptyState
            className="m-4"
            title={
              globalFilter ? fmt(L.noMatch, { query: globalFilter }) : (emptyTitle ?? L.noData)
            }
            description={globalFilter ? L.noMatchHint : emptyDescription}
          />
        )}
      </div>

      {/* footer */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-fg-muted">
          <span className="font-mono tabular">
            {pageIndex * table.getState().pagination.pageSize + 1}–
            {Math.min((pageIndex + 1) * table.getState().pagination.pageSize, filteredCount)} /{' '}
            {filteredCount}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={L.prevPage}
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={L.nextPage}
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
