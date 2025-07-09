import Form from './uploader';
import { ImagesTable } from '@/components/ui/images-table';

export default function Home() {
  return (
    <main className="container mx-auto py-8 space-y-8">
      <Form />
      <ImagesTable />
    </main>
  );
}
