import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { Search, Package, Plus, Pencil, Archive, Printer, Trash2, Upload, Download, DollarSign } from 'lucide-react';
import type { Product, PriceBreak } from '@pos/types';

interface Category { id: string; name: string }

interface ProductFormData {
  name: string;
  sku: string;
  price: string;
  cost: string;
  categoryId: string;
  taxable: boolean;
  trackInventory: boolean;
}

const EMPTY_FORM: ProductFormData = {
  name: '', sku: '', price: '', cost: '', categoryId: '', taxable: true, trackInventory: true,
};

export function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [breaks, setBreaks] = useState<PriceBreak[]>([]);
  const [newBreak, setNewBreak] = useState({ minQty: '', price: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () =>
      api.get('/products', { params: { q: search || undefined, pageSize: 100 } }).then((r) => r.data),
  });

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data.data as Category[]),
  });

  const products: Product[] = data?.data ?? [];
  const categories: Category[] = catData ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: object) =>
      editing
        ? api.patch(`/products/${editing.id}`, payload).then((r) => r.data)
        : api.post('/products', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDialogOpen(false);
    },
    onError: (err: unknown) => {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const addBreakMutation = useMutation({
    mutationFn: (data: { minQty: number; price: number }) =>
      api.post(`/price-breaks/products/${editing!.id}`, data).then((r) => r.data.data as PriceBreak),
    onSuccess: (pb) => {
      setBreaks((prev) => [...prev, pb].sort((a, b) => a.minQty - b.minQty));
      setNewBreak({ minQty: '', price: '' });
    },
  });

  const deleteBreakMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/price-breaks/${id}`),
    onSuccess: (_, id) => setBreaks((prev) => prev.filter((b) => b.id !== id)),
  });

  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvResult, setCsvResult] = useState<{ imported: number; created: number; updated: number; errors: { row: number; error: string }[] } | null>(null);
  const [priceUpdateOpen, setPriceUpdateOpen] = useState(false);
  const [priceUpdateResult, setPriceUpdateResult] = useState<{ updated: number; errors: { row: number; error: string }[] } | null>(null);
  const importMutation = useMutation({
    mutationFn: (csv: string) => api.post('/products/import-csv', { csv }).then((r) => r.data.data),
    onSuccess: (result) => {
      setCsvResult(result);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const priceUpdateMutation = useMutation({
    mutationFn: (csv: string) => api.post('/products/bulk-price-update', { csv }).then((r) => r.data.data),
    onSuccess: (result) => {
      setPriceUpdateResult(result);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  useEffect(() => {
    if (editing) {
      api.get(`/price-breaks/products/${editing.id}`).then((r) => setBreaks(r.data.data));
    } else {
      setBreaks([]);
      setNewBreak({ minQty: '', price: '' });
    }
  }, [editing]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setForm({
      name: product.name,
      sku: product.sku ?? '',
      price: String(product.price),
      cost: product.cost != null ? String(product.cost) : '',
      categoryId: product.category?.id ?? '',
      taxable: product.taxable,
      trackInventory: product.trackInventory,
    });
    setFormError('');
    setDialogOpen(true);
  }

  async function printLabel(productId: string) {
    const html = await api.get(`/labels/products?productIds=${productId}`).then((r) => r.data as string);
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const price = parseFloat(form.price);
    if (!form.name.trim()) return setFormError('Name is required');
    if (isNaN(price) || price < 0) return setFormError('Price must be a valid number');

    saveMutation.mutate({
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      price,
      cost: form.cost ? parseFloat(form.cost) : undefined,
      categoryId: form.categoryId || undefined,
      taxable: form.taxable,
      trackInventory: form.trackInventory,
    });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setPriceUpdateResult(null); setPriceUpdateOpen(true); }}>
            <DollarSign className="h-4 w-4 mr-2" />
            Update Prices
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setCsvResult(null); setCsvImportOpen(true); }}>
            <Upload className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">SKU</th>
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-right p-3 font-medium">Cost</th>
                <th className="text-right p-3 font-medium">Price</th>
                <th className="text-right p-3 font-medium">GP%</th>
                <th className="text-center p-3 font-medium">Variants</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{product.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{product.sku ?? '—'}</td>
                  <td className="p-3">
                    {product.category ? (
                      <Badge variant="secondary">{product.category.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">
                    {product.cost != null ? formatCurrency(product.cost) : '—'}
                  </td>
                  <td className="p-3 text-right font-medium">{formatCurrency(product.price)}</td>
                  <td className="p-3 text-right">
                    {product.cost != null && product.price > 0 ? (
                      <span className={product.price > product.cost ? 'text-green-600 font-medium' : 'text-destructive font-medium'}>
                        {(((product.price - product.cost) / product.price) * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    {product.variants.length > 0 ? (
                      <Badge variant="outline">{product.variants.length}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <Badge variant={product.active ? 'success' : 'secondary'}>
                      {product.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title="Print label"
                        onClick={() => printLabel(product.id)}
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => openEdit(product)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {product.active && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => archiveMutation.mutate(product.id)}
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    No products found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Name *</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. T-Shirt"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-price">Price *</Label>
                <Input
                  id="p-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-cost">Cost</Label>
                <Input
                  id="p-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-sku">SKU</Label>
                <Input
                  id="p-sku"
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  placeholder="AUTO"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.categoryId || '__none__'}
                  onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.taxable}
                  onChange={(e) => setForm((f) => ({ ...f, taxable: e.target.checked }))}
                  className="rounded border-input"
                />
                Taxable
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.trackInventory}
                  onChange={(e) => setForm((f) => ({ ...f, trackInventory: e.target.checked }))}
                  className="rounded border-input"
                />
                Track Inventory
              </label>
            </div>

            {editing && (
              <div className="space-y-2">
                <Label>Volume Price Breaks</Label>
                <div className="border rounded-lg overflow-hidden text-sm">
                  {breaks.length > 0 ? (
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2 font-medium">Min Qty</th>
                          <th className="text-left p-2 font-medium">Price</th>
                          <th className="p-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {breaks.map((b) => (
                          <tr key={b.id}>
                            <td className="p-2">{b.minQty}+</td>
                            <td className="p-2">{formatCurrency(b.price)}</td>
                            <td className="p-2 text-right">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteBreakMutation.mutate(b.id)}
                                disabled={deleteBreakMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="p-3 text-xs text-muted-foreground">No price breaks configured</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number" min="2" placeholder="Min qty"
                    value={newBreak.minQty}
                    onChange={(e) => setNewBreak((f) => ({ ...f, minQty: e.target.value }))}
                    className="w-28"
                  />
                  <Input
                    type="number" min="0" step="0.01" placeholder="Price"
                    value={newBreak.price}
                    onChange={(e) => setNewBreak((f) => ({ ...f, price: e.target.value }))}
                    className="w-28"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!newBreak.minQty || !newBreak.price || addBreakMutation.isPending}
                    onClick={() =>
                      addBreakMutation.mutate({
                        minQty: parseInt(newBreak.minQty),
                        price: parseFloat(newBreak.price),
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />Add
                  </Button>
                </div>
              </div>
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── CSV Import dialog ──────────────────────────────────────────────── */}
      <Dialog open={csvImportOpen} onOpenChange={(o) => { setCsvImportOpen(o); if (!o) setCsvResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Products from CSV</DialogTitle>
          </DialogHeader>

          {!csvResult ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a CSV with columns: <code className="text-xs bg-muted px-1 rounded">name</code>, <code className="text-xs bg-muted px-1 rounded">price</code> (required) and optionally <code className="text-xs bg-muted px-1 rounded">sku</code>, <code className="text-xs bg-muted px-1 rounded">barcode</code>, <code className="text-xs bg-muted px-1 rounded">cost</code>, <code className="text-xs bg-muted px-1 rounded">category</code>, <code className="text-xs bg-muted px-1 rounded">taxable</code>, <code className="text-xs bg-muted px-1 rounded">imageUrl</code>.
                Products are upserted by SKU when provided.
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    const template = 'name,sku,barcode,price,cost,category,taxable,description,imageUrl\nSample Widget,SKU001,123456789,9.99,4.50,General,true,A sample product,\n';
                    const blob = new Blob([template], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'products-template.csv'; a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Template
                </Button>
              </div>

              <label className="block">
                <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to select a CSV file</p>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    disabled={importMutation.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const csv = ev.target?.result as string;
                        if (csv) importMutation.mutate(csv);
                      };
                      reader.readAsText(file);
                    }}
                  />
                </div>
              </label>

              {importMutation.isPending && (
                <p className="text-sm text-center text-muted-foreground">Importing…</p>
              )}
              {importMutation.isError && (
                <p className="text-sm text-destructive">
                  {importMutation.error instanceof Error ? importMutation.error.message : 'Import failed'}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-4 grid grid-cols-3 gap-4 text-center">
                <div><p className="text-2xl font-bold text-green-600">{csvResult.created}</p><p className="text-xs text-muted-foreground">Created</p></div>
                <div><p className="text-2xl font-bold text-blue-600">{csvResult.updated}</p><p className="text-xs text-muted-foreground">Updated</p></div>
                <div><p className="text-2xl font-bold text-destructive">{csvResult.errors.length}</p><p className="text-xs text-muted-foreground">Errors</p></div>
              </div>
              {csvResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {csvResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive">Row {e.row}: {e.error}</p>
                  ))}
                </div>
              )}
              <Button className="w-full" onClick={() => setCsvImportOpen(false)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk Price Update dialog ───────────────────────────────────────── */}
      <Dialog open={priceUpdateOpen} onOpenChange={(o) => { setPriceUpdateOpen(o); if (!o) setPriceUpdateResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Price Update</DialogTitle>
          </DialogHeader>

          {!priceUpdateResult ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a CSV to update prices and/or costs for existing products. Columns: <code className="text-xs bg-muted px-1 rounded">sku</code> or <code className="text-xs bg-muted px-1 rounded">barcode</code> (required) + <code className="text-xs bg-muted px-1 rounded">price</code> and/or <code className="text-xs bg-muted px-1 rounded">cost</code>.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  const template = 'sku,barcode,price,cost\nSKU001,,9.99,4.50\n,123456789,14.99,7.00\n';
                  const blob = new Blob([template], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'price-update-template.csv'; a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Download Template
              </Button>
              <label className="block">
                <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors">
                  <DollarSign className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to select a CSV file</p>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    disabled={priceUpdateMutation.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const csv = ev.target?.result as string;
                        if (csv) priceUpdateMutation.mutate(csv);
                      };
                      reader.readAsText(file);
                    }}
                  />
                </div>
              </label>
              {priceUpdateMutation.isPending && <p className="text-sm text-center text-muted-foreground">Updating…</p>}
              {priceUpdateMutation.isError && (
                <p className="text-sm text-destructive">
                  {priceUpdateMutation.error instanceof Error ? priceUpdateMutation.error.message : 'Update failed'}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-4 grid grid-cols-2 gap-4 text-center">
                <div><p className="text-2xl font-bold text-blue-600">{priceUpdateResult.updated}</p><p className="text-xs text-muted-foreground">Updated</p></div>
                <div><p className="text-2xl font-bold text-destructive">{priceUpdateResult.errors.length}</p><p className="text-xs text-muted-foreground">Errors</p></div>
              </div>
              {priceUpdateResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {priceUpdateResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive">Row {e.row}: {e.error}</p>
                  ))}
                </div>
              )}
              <Button className="w-full" onClick={() => setPriceUpdateOpen(false)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
