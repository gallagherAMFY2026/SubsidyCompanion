import PrintTray from '../PrintTray';

export default function PrintTrayExample() {
  return (
    <div className="flex justify-center p-4">
      <PrintTray 
        documentTitle="Submission Pack"
        onExport={(method, contact) => console.log('Export:', method, contact)} 
      />
    </div>
  );
}