import { useId } from 'react';
import { getListCategoriesQueryKey, useListCategories } from '@workspace/api-client-react';

export function BusinessCategoryPicker({ value, onChange, error }: {
  value: string[];
  onChange: (value: string[]) => void;
  error?: string | null;
}) {
  const hintId = useId();
  const errorId = useId();
  const categories = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  return <fieldset className="min-w-0 space-y-2 sm:col-span-2" aria-describedby={error ? `${hintId} ${errorId}` : hintId}>
    <legend className="text-sm font-medium">Kategorien</legend>
    <p id={hintId} className="text-sm text-muted-foreground">Wähle mindestens eine Kategorie. Die zuerst gewählte ist deine Hauptkategorie.</p>
    {categories.isPending ? <p role="status">Kategorien werden geladen …</p>
      : categories.isError || !categories.data.length ? <>
        <p role="status">Kategorien sind derzeit nicht verfügbar.</p>
        <button type="button" onClick={() => void categories.refetch()} className="text-sm underline">Kategorien neu laden</button>
      </> : <div className="grid gap-2 sm:grid-cols-2">
        {categories.data.map(({ id, name }) => <label key={id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={value.includes(id)}
            onChange={(event) => onChange(event.target.checked ? [...value, id] : value.filter((selected) => selected !== id))} />
          <span>{name}{value[0] === id && <span className="block text-xs text-muted-foreground">Hauptkategorie</span>}</span>
        </label>)}
      </div>}
    {error && <p id={errorId} role="alert" className="text-sm text-destructive">{error}</p>}
  </fieldset>;
}
