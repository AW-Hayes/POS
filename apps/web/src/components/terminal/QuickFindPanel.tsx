import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import type { Category, Product } from '@pos/types';

interface Props {
  onAddToCart: (product: Product) => void;
  onVariantRequired: (product: Product) => void;
}

function buildTree(categories: Category[]): Category[] {
  const map = new Map<string, Category>(categories.map((c) => [c.id, { ...c, children: [] }]));
  const roots: Category[] = [];
  for (const cat of map.values()) {
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children = [...(map.get(cat.parentId)!.children ?? []), cat];
    } else {
      roots.push(cat);
    }
  }
  return roots.sort((a, b) => a.sortOrder - b.sortOrder);
}

export function QuickFindPanel({ onAddToCart, onVariantRequired }: Props) {
  const [trail, setTrail] = useState<Category[]>([]); // breadcrumb stack
  const currentCategory = trail[trail.length - 1] ?? null;

  const { data: allCategories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products', 'quickfind', currentCategory?.id ?? 'root'],
    queryFn: () =>
      api
        .get('/products', {
          params: { categoryId: currentCategory?.id ?? undefined, pageSize: 80 },
        })
        .then((r) => r.data.data),
  });

  const tree = useMemo(() => buildTree(allCategories), [allCategories]);

  // Categories to show at this level.
  const visibleCategories = currentCategory
    ? currentCategory.children ?? []
    : tree;

  function drillInto(cat: Category) {
    setTrail((prev) => [...prev, cat]);
  }

  function goUp() {
    setTrail((prev) => prev.slice(0, -1));
  }

  // Products to display: only show if we're at a category with no sub-categories.
  const showProducts = visibleCategories.length === 0 || currentCategory !== null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-3 py-2 border-b text-sm overflow-x-auto shrink-0">
        <button
          className={cn(
            'font-medium transition-colors',
            trail.length === 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setTrail([])}
        >
          All
        </button>
        {trail.map((cat, i) => (
          <span key={cat.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <button
              className={cn(
                'font-medium transition-colors',
                i === trail.length - 1
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setTrail(trail.slice(0, i + 1))}
            >
              {cat.name}
            </button>
          </span>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Category panel */}
        {visibleCategories.length > 0 && (
          <div className="w-44 shrink-0 border-r overflow-y-auto p-2 space-y-1">
            {trail.length > 0 && (
              <button
                onClick={goUp}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground py-1 px-2 w-full"
              >
                <ChevronLeft className="h-3 w-3" />
                Back
              </button>
            )}
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => drillInto(cat)}
                className="w-full text-left px-2 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent flex items-center justify-between gap-1"
              >
                <span className="truncate">{cat.name}</span>
                {(cat.children?.length ?? 0) > 0 && (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Product grid */}
        {showProducts && (
          <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
            {products.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-10 text-sm">
                {currentCategory ? 'No products in this category' : 'Select a category'}
              </div>
            )}
            {products.map((product) => {
              const hasVariants = product.variants.length > 0;
              return (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:border-primary transition-colors select-none"
                  onClick={() => {
                    if (hasVariants) onVariantRequired(product);
                    else onAddToCart(product);
                  }}
                >
                  <CardContent className="p-3 flex flex-col gap-1">
                    <p className="text-sm font-medium leading-tight line-clamp-2">{product.name}</p>
                    <p className="text-primary font-semibold text-sm">{formatCurrency(product.price)}</p>
                    {product.sku && (
                      <p className="text-xs text-muted-foreground font-mono">{product.sku}</p>
                    )}
                    {hasVariants && (
                      <Badge variant="secondary" className="text-xs w-fit">
                        {product.variants.length} variants
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
