import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RateRangeInputProps = {
  label: string;
  namePrefix: string;
  lowDefault?: number | null;
  typicalDefault?: number | null;
  highDefault?: number | null;
};

export function RateRangeInput({
  label,
  namePrefix,
  lowDefault,
  typicalDefault,
  highDefault,
}: RateRangeInputProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Low</span>
          <Input
            name={`low${namePrefix}`}
            type="number"
            min={0}
            step="0.01"
            defaultValue={lowDefault ?? typicalDefault ?? ""}
            required
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Typical</span>
          <Input
            name={`typical${namePrefix}`}
            type="number"
            min={0}
            step="0.01"
            defaultValue={typicalDefault ?? ""}
            required
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">High</span>
          <Input
            name={`high${namePrefix}`}
            type="number"
            min={0}
            step="0.01"
            defaultValue={highDefault ?? typicalDefault ?? ""}
            required
          />
        </div>
      </div>
    </div>
  );
}
