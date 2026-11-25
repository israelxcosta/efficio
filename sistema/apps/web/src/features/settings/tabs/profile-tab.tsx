import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Monitor, Moon, SlidersHorizontal, Sun } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { updateProfileSchema } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useTheme, type ThemePreference } from '@/lib/theme';
import { toastError } from '@/lib/notify';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { ProfilePhotoActions } from '@/features/profile/photo-actions';
import { useAuth } from '@/features/auth/auth-context';
import { usePermissions } from '@/features/auth/permissions';
import { Cell, TabGrid } from './layout';

export function ProfileTab() {
  const { user, updateProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { canAccessFinance } = usePermissions();
  const form = useForm<z.input<typeof updateProfileSchema>, unknown, z.output<typeof updateProfileSchema>>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: user?.name ?? '' },
  });
  useEffect(() => {
    form.reset({ name: user?.name ?? '' });
  }, [user?.name, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updateProfile(values);
      toast.success('Perfil atualizado');
    } catch (error) {
      toastError(error);
    }
  });

  return (
    <TabGrid>
      <Cell>
        <Card className="p-6">
          <CardHeader title="Perfil" />
          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
            <div className="flex flex-wrap items-center gap-4">
              <MemberAvatar size="xl" name={user?.name} userId={user?.id} photoVersion={user?.photoUpdatedAt ?? null} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{user?.name}</p>
                <p className="truncate text-body-sm text-muted">{user?.email}</p>
              </div>
              <ProfilePhotoActions />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome" error={form.formState.errors.name?.message}>
                <Input autoComplete="name" {...form.register('name')} />
              </Field>
              <Field label="E-mail" hint="O e-mail não pode ser alterado.">
                <Input value={user?.email ?? ''} disabled readOnly />
              </Field>
            </div>
            <div>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Salvar alterações
              </Button>
            </div>
          </form>
        </Card>
      </Cell>

      {/* One card for the personal preferences (a card per control left a 290px card with one switch). */}
      <Cell>
        <Card className="p-6">
          <CardHeader title="Preferências" />
          <div className="mt-5 flex flex-col divide-y divide-border">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <div className="min-w-0">
                <p className="text-body-sm font-semibold text-fg">Tema</p>
                <p className="text-caption text-muted">Claro, escuro ou o mesmo do sistema.</p>
              </div>
              <SegmentedControl
                ariaLabel="Tema"
                value={theme}
                onChange={(t: ThemePreference) => setTheme(t)}
                options={[
                  { value: 'light', label: 'Claro', icon: <Sun /> },
                  { value: 'dark', label: 'Escuro', icon: <Moon /> },
                  { value: 'system', label: 'Sistema', icon: <Monitor /> },
                ]}
              />
            </div>
            {canAccessFinance ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                <div className="min-w-0">
                  <p className="text-body-sm font-semibold text-fg">Painel financeiro</p>
                  <p className="text-caption text-muted">Cards exibidos, tamanhos e cards ocultos pelo botão de olho.</p>
                </div>
                <Button variant="outline" asChild>
                  <Link to="/financeiro?personalizar=1">
                    <SlidersHorizontal /> Personalizar painel
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      </Cell>
    </TabGrid>
  );
}
