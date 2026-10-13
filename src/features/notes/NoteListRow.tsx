import { notePreview, type Note } from '../../domain/note';
import { Icon } from '../../ui/components/Icon';
import { ListRow } from '../../ui/components/ListRow';
import { useColors } from '../../ui/tokens';

/** A note in a list (B9): its title and up to two lines of it. The whole note is one tap away. */
export function NoteListRow({ note, onPress }: { note: Note; onPress: () => void }) {
  const c = useColors();
  const preview = notePreview(note.body);
  return (
    <ListRow
      title={note.title}
      subtitle={preview || null}
      leading={note.pinned ? <Icon name="pin" size={18} color={c.accentText} /> : null}
      onPress={onPress}
      accessibilityLabel={note.pinned ? `${note.title}, pinned` : note.title}
    />
  );
}
