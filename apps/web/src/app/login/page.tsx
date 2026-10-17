'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FileSignature, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const schema = z.object({
  tenantCode: z.string().trim().min(1, 'Vui lòng nhập mã doanh nghiệp'),
  email: z.email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { tenantCode: '', email: '', password: '' } });

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không thể kết nối máy chủ');
    }
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FileSignature className="size-5" />
          </div>
          <CardTitle className="text-xl">SAHA eContract</CardTitle>
          <CardDescription>Đăng nhập để quản lý hợp đồng điện tử</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="tenantCode">Mã doanh nghiệp</Label>
              <Input id="tenantCode" autoComplete="organization" aria-invalid={!!errors.tenantCode} {...form.register('tenantCode')} />
              {errors.tenantCode && <p className="text-xs text-destructive">{errors.tenantCode.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register('password')} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Đăng nhập
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
