'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, FileSignature, Loader2 } from 'lucide-react';
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
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Khối thương hiệu (màn hình rộng) */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-[oklch(0.3_0.09_262)] via-[oklch(0.36_0.13_262)] to-[oklch(0.47_0.17_258)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-sky-400/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-blue-300/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <FileSignature className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">SAHA eContract</span>
        </div>
        <div className="relative max-w-md space-y-5">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">Quản lý hợp đồng điện tử tập trung, an toàn và minh bạch</h2>
          <ul className="space-y-3 text-sm text-white/85">
            {['Soạn thảo theo mẫu, phê duyệt nhiều cấp', 'Ký điện tử và ký số MISA eSign', 'Theo dõi vòng đời, thanh toán, giao hàng'].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <CheckCircle2 className="size-4 shrink-0 text-sky-300" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">© SAHA eContract. Mọi thao tác đều được ghi nhật ký.</p>
      </section>

      <div className="flex items-center justify-center p-4 sm:p-8">
      <Card className="w-full max-w-sm border-0 shadow-none sm:border sm:shadow-lg sm:shadow-slate-900/5">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-md shadow-blue-900/20 lg:hidden">
            <FileSignature className="size-5" />
          </div>
          <CardTitle className="text-xl">Đăng nhập</CardTitle>
          <CardDescription>Đăng nhập để quản lý hợp đồng điện tử</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="tenantCode">Mã doanh nghiệp</Label>
              <Input className="h-10" id="tenantCode" autoComplete="organization" aria-invalid={!!errors.tenantCode} {...form.register('tenantCode')} />
              {errors.tenantCode && <p className="text-xs text-destructive">{errors.tenantCode.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input className="h-10" id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input className="h-10" id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register('password')} />
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Đăng nhập
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </main>
  );
}
