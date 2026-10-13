import type { TripItemStatus } from '../../domain/tripItem';
import { Tag, type TagTone } from './Tag';

const STATUS_TAGS: Record<TripItemStatus, { label: string; tone: TagTone }> = {
  idea: { label: 'Idea', tone: 'outline' },
  confirmed: { label: 'Confirmed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** Commitment is the axis the app is organised around, so it gets one consistent look. */
export function StatusTag({ status }: { status: TripItemStatus }) {
  const { label, tone } = STATUS_TAGS[status];
  return <Tag label={label} tone={tone} />;
}
