export interface PageInput {
  page: number;
  pageSize: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  nextCursor?: string;
}

export function paginate<T>(items: T[], total: number, input: PageInput, cursorField?: string): Page<T> {
  const hasNext = input.page * input.pageSize < total;
  return {
    items,
    total,
    page: input.page,
    pageSize: input.pageSize,
    hasNext,
    nextCursor: hasNext && cursorField && items.length ? String((items[items.length - 1] as never)[cursorField]) : undefined,
  };
}
