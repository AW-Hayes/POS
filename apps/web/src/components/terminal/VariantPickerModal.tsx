import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { Product, ProductVariant } from '@pos/types';

interface Props {
  product: Product;
  onSelect: (product: Product, variantId: string) => void;
  onClose: () => void;
}

// Build a map of { attrName -> Set<value> } from the product's variants.
function extractAttributes(product: Product): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const variant of product.variants) {
    for (const av of variant.attributeValues) {
      const name = av.productAttribute.attribute.name;
      if (!map.has(name)) map.set(name, []);
      if (!map.get(name)!.includes(av.value)) map.get(name)!.push(av.value);
    }
  }
  return map;
}

function findVariant(product: Product, selection: Record<string, string>): ProductVariant | undefined {
  return product.variants.find((v) =>
    Object.entries(selection).every(([attrName, val]) =>
      v.attributeValues.some(
        (av) => av.productAttribute.attribute.name === attrName && av.value === val,
      ),
    ),
  );
}

export function VariantPickerModal({ product, onSelect, onClose }: Props) {
  const attributes = extractAttributes(product);
  const attrNames = Array.from(attributes.keys());
  const [selection, setSelection] = useState<Record<string, string>>({});

  const selectedVariant = attrNames.length > 0 && attrNames.every((n) => selection[n])
    ? findVariant(product, selection)
    : undefined;

  function toggle(attrName: string, value: string) {
    setSelection((prev) =>
      prev[attrName] === value ? { ...prev, [attrName]: '' } : { ...prev, [attrName]: value },
    );
  }

  // Check if a specific value combination is available (has a matching variant).
  function isAvailable(attrName: string, value: string): boolean {
    const trial = { ...selection, [attrName]: value };
    // Only check availability when all other attrs are selected.
    const otherAttrs = attrNames.filter((n) => n !== attrName);
    if (otherAttrs.some((n) => !trial[n])) return true; // can't know yet
    return !!findVariant(product, trial);
  }

  // For 2-attribute products, render an axis matrix.
  const renderMatrix = attrNames.length === 2;
  const [rowAttr, colAttr] = attrNames;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-start justify-between p-4 border-b">
          <div>
            <p className="font-semibold">{product.name}</p>
            <p className="text-sm text-muted-foreground">Select an option</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {renderMatrix ? (
            /* 2-attr matrix: rows = rowAttr values, cols = colAttr values */
            <div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${attributes.get(colAttr)!.length}, 1fr)` }}>
                {/* Header row */}
                <div />
                {attributes.get(colAttr)!.map((colVal) => (
                  <div key={colVal} className="text-xs font-medium text-center text-muted-foreground py-1">
                    {colVal}
                  </div>
                ))}
                {/* Data rows */}
                {attributes.get(rowAttr)!.map((rowVal) => (
                  <>
                    <div key={rowVal} className="text-xs font-medium text-muted-foreground self-center pr-2">
                      {rowVal}
                    </div>
                    {attributes.get(colAttr)!.map((colVal) => {
                      const trial = { [rowAttr]: rowVal, [colAttr]: colVal };
                      const variant = findVariant(product, trial);
                      const isSelected =
                        selection[rowAttr] === rowVal && selection[colAttr] === colVal;
                      return (
                        <Button
                          key={colVal}
                          size="sm"
                          variant={isSelected ? 'default' : 'outline'}
                          className={cn('h-9 text-xs', !variant && 'opacity-30 cursor-not-allowed')}
                          disabled={!variant}
                          onClick={() => {
                            if (variant) {
                              setSelection({ [rowAttr]: rowVal, [colAttr]: colVal });
                            }
                          }}
                        >
                          {variant?.price != null && variant.price !== product.price
                            ? formatCurrency(variant.price)
                            : '✓'}
                        </Button>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          ) : (
            /* Single attr or 3+ attrs: sequential selects */
            attrNames.map((attrName) => (
              <div key={attrName}>
                <p className="text-sm font-medium mb-2">{attrName}</p>
                <div className="flex flex-wrap gap-2">
                  {attributes.get(attrName)!.map((val) => {
                    const avail = isAvailable(attrName, val);
                    return (
                      <Button
                        key={val}
                        size="sm"
                        variant={selection[attrName] === val ? 'default' : 'outline'}
                        className={cn(!avail && 'opacity-30 cursor-not-allowed')}
                        disabled={!avail}
                        onClick={() => toggle(attrName, val)}
                      >
                        {val}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {selectedVariant && (
            <div className="rounded-md bg-muted/40 p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {attrNames.map((n) => selection[n]).join(' / ')}
                </p>
                {selectedVariant.sku && (
                  <p className="text-xs text-muted-foreground">{selectedVariant.sku}</p>
                )}
              </div>
              <Badge variant="secondary">{formatCurrency(selectedVariant.price ?? product.price)}</Badge>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!selectedVariant}
            onClick={() => selectedVariant && onSelect(product, selectedVariant.id)}
          >
            Add to Order
          </Button>
        </div>
      </div>
    </div>
  );
}
