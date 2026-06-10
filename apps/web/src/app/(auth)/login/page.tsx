import dynamic from 'next/dynamic';

const LoginForm = dynamic(() => import('@/components/login-form'), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-white" />,
});

export default function LoginPage() {
  return <LoginForm />;
}
