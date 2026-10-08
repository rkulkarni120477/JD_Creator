type ExamplePromptsProps = {
  examples: string[];
  value: string;
  onSelect: (prompt: string) => void;
};

export function ExamplePrompts({ examples, value, onSelect }: ExamplePromptsProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">Example prompts</p>
      <div className="flex flex-wrap gap-2">
        {examples.map((example) => {
          const isSelected = value === example;

          return (
            <button
              key={example}
              type="button"
              onClick={() => onSelect(example)}
              className={[
                'rounded-full border px-3 py-1.5 text-left text-sm transition-colors',
                isSelected
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              ].join(' ')}
            >
              {example}
            </button>
          );
        })}
      </div>
    </div>
  );
}
