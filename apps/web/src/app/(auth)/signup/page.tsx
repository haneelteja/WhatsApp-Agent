import dynamic from 'next/dynamic';

const SignupForm = dynamic(() => import('@/components/signup-form'), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-[#f3fdf5]" />,
});

export default function SignupPage() {
  return <SignupForm />;
}
