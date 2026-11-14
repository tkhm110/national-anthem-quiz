import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { searchCountries } from "../lib/countries";
import type { Country } from "../lib/schema";

type Props = {
  countries: readonly Country[];
  onSelect: (countryId: string) => void;
};

/**
 * 超級の回答欄。国名を入力すると候補が出て、候補から選んだ国だけを答えとして受け付ける（表記の揺れを防ぐ）。
 * スクリーンリーダー向けに、コンボボックス（入力欄＋候補の一覧）の作法に沿って作る。
 * 矢印キーで候補を移動し、Enter で選ぶ。日本語入力の変換中の Enter は、答えとして扱わない。
 */
export function CountryAnswerInput({ countries, onSelect }: Props) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const optionId = (id: string) => `${baseId}-option-${id}`;

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const candidates = useMemo(() => searchCountries(countries, query), [countries, query]);
  const active = candidates[Math.min(activeIndex, candidates.length - 1)];
  const open = candidates.length > 0;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" && open) {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % candidates.length);
    } else if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      onSelect(active.id);
    } else if (event.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div className="country-answer">
      <label htmlFor={inputId} className="country-answer-label">
        国名を入力して、候補から選んでください
      </label>
      <input
        id={inputId}
        className="country-answer-input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active ? optionId(active.id) : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="例：にほん、アメリカ、France"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      <ul id={listId} role="listbox" aria-label="国名の候補" className="country-answer-list">
        {candidates.map((country) => (
          <li
            key={country.id}
            id={optionId(country.id)}
            role="option"
            aria-selected={country.id === active?.id}
            className="country-answer-option"
            // 入力欄からフォーカスが外れる前に選べるように、mousedown の既定の動作を止める
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(country.id)}
          >
            <span>{country.nameJa}</span>
            <span className="hint">{country.nameEn}</span>
          </li>
        ))}
      </ul>
      <p className="hint" role="status" aria-live="polite">
        {query.trim() !== "" && candidates.length === 0 ? "候補が見つかりません" : ""}
      </p>
    </div>
  );
}
