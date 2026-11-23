import { useState, type FormEvent } from 'react';
import {
  Building2,
  ClipboardCheck,
  Eye,
  EyeOff,
  GraduationCap,
  HeartHandshake,
  House,
  Shield,
  ShieldCheck,
  Siren,
  UserRound,
  BriefcaseBusiness,
  Sparkles,
} from 'lucide-react';
import type { RegistrationRole } from '../types';
import { useAuth } from '../context/AuthContext';

type RegistrationField = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
};

const roleOptions: Array<{
  role: RegistrationRole | null;
  label: string;
  description: string;
  icon: typeof GraduationCap;
}> = [
  { role: 'STUDENT', label: 'Student', description: 'Student leave and hostel services', icon: GraduationCap },
  { role: 'MENTOR', label: 'Faculty Mentor', description: 'Faculty leave approvals', icon: UserRound },
  { role: 'COORDINATOR', label: 'Coordinator', description: 'Department coordination', icon: ClipboardCheck },
  { role: 'HOD', label: 'HOD', description: 'Head of Department', icon: Building2 },
  { role: 'SWO', label: 'Student Welfare Officer', description: 'Student welfare services', icon: HeartHandshake },
  { role: 'WARDEN', label: 'Hostel Warden', description: 'Hostel operations', icon: House },
  { role: 'AO', label: 'Administrative Officer (AO)', description: 'Administrative services', icon: BriefcaseBusiness },
  { role: 'SECURITY', label: 'Security Guard', description: 'Gate security operations', icon: ShieldCheck },
  { role: 'EMERGENCY_CONTROL', label: 'Emergency Control Centre (ECC)', description: 'Emergency response', icon: Siren },
  { role: null, label: 'System Admin', description: 'Created only by secure provisioning', icon: Shield },
];

const studentFields: RegistrationField[] = [
  { name: 'name', label: 'Full Name' },
  { name: 'usn', label: 'USN / Student ID' },
  { name: 'email', label: 'Institutional Email', type: 'email' },
  { name: 'phone', label: 'Phone Number', type: 'tel' },
  { name: 'department', label: 'Department' },
  { name: 'semester', label: 'Semester', type: 'number' },
  { name: 'section', label: 'Section' },
  { name: 'hostelBlock', label: 'Hostel Block', required: false },
  { name: 'roomNumber', label: 'Room Number', required: false },
  { name: 'parentPhone', label: 'Parent Phone', type: 'tel', required: false },
];

const staffFields: Record<Exclude<RegistrationRole, 'STUDENT'>, RegistrationField[]> = {
  MENTOR: [
    { name: 'name', label: 'Full Name' },
    { name: 'employeeId', label: 'Employee ID / Staff ID' },
    { name: 'email', label: 'Official Institutional Email', type: 'email' },
    { name: 'phone', label: 'Phone Number', type: 'tel' },
    { name: 'department', label: 'Department' },
    { name: 'designation', label: 'Designation' },
  ],
  COORDINATOR: [
    { name: 'name', label: 'Full Name' },
    { name: 'employeeId', label: 'Employee ID' },
    { name: 'email', label: 'Official Email', type: 'email' },
    { name: 'phone', label: 'Phone Number', type: 'tel' },
    { name: 'department', label: 'Department' },
    { name: 'designation', label: 'Designation' },
  ],
  HOD: [
    { name: 'name', label: 'Full Name' },
    { name: 'employeeId', label: 'Employee ID' },
    { name: 'email', label: 'Official Email', type: 'email' },
    { name: 'phone', label: 'Phone Number', type: 'tel' },
    { name: 'department', label: 'Department' },
    { name: 'designation', label: 'Designation' },
  ],
  SWO: [
    { name: 'name', label: 'Full Name' },
    { name: 'employeeId', label: 'Employee ID' },
    { name: 'email', label: 'Official Email', type: 'email' },
    { name: 'phone', label: 'Phone Number', type: 'tel' },
    { name: 'officeDepartment', label: 'Office / Department' },
    { name: 'designation', label: 'Designation' },
  ],
  WARDEN: [
    { name: 'name', label: 'Full Name' },
    { name: 'employeeId', label: 'Employee ID' },
    { name: 'email', label: 'Official Email', type: 'email' },
    { name: 'phone', label: 'Phone Number', type: 'tel' },
    { name: 'assignedHostelBlock', label: 'Assigned Hostel Block' },
    { name: 'hostelName', label: 'Hostel Name' },
    { name: 'designation', label: 'Designation' },
  ],
  AO: [
    { name: 'name', label: 'Full Name' },
    { name: 'employeeId', label: 'Employee ID' },
    { name: 'email', label: 'Official Email', type: 'email' },
    { name: 'phone', label: 'Phone Number', type: 'tel' },
    { name: 'administrativeDepartment', label: 'Administrative Department' },
    { name: 'designation', label: 'Designation' },
  ],
  SECURITY: [
    { name: 'name', label: 'Full Name' },
    { name: 'employeeId', label: 'Employee ID' },
    { name: 'email', label: 'Official Email', type: 'email' },
    { name: 'phone', label: 'Phone Number', type: 'tel' },
    { name: 'assignedGate', label: 'Assigned Gate' },
    { name: 'dutyLocation', label: 'Duty Location' },
    { name: 'shift', label: 'Shift', options: ['Morning', 'Evening', 'Night', 'Rotating'] },
  ],
  EMERGENCY_CONTROL: [
    { name: 'name', label: 'Full Name' },
    { name: 'employeeId', label: 'Employee ID' },
    { name: 'email', label: 'Official Email', type: 'email' },
    { name: 'phone', label: 'Phone Number', type: 'tel' },
    { name: 'assignedControlCentre', label: 'Assigned Control Centre' },
    { name: 'designation', label: 'Designation' },
  ],
};

function emptyValues(): Record<string, string> {
  return {
    name: '',
    usn: '',
    email: '',
    phone: '',
    department: '',
    semester: '',
    section: '',
    hostelBlock: '',
    roomNumber: '',
    parentPhone: '',
    employeeId: '',
    officeDepartment: '',
    administrativeDepartment: '',
    designation: '',
    assignedHostelBlock: '',
    hostelName: '',
    assignedGate: '',
    dutyLocation: '',
    shift: '',
    assignedControlCentre: '',
    password: '',
    confirmPassword: '',
  };
}

export function RegistrationForm({ onSignIn }: { onSignIn: () => void }) {
  const { submitRegistration } = useAuth();
  const [selectedRole, setSelectedRole] = useState<RegistrationRole>('STUDENT');
  const [values, setValues] = useState(emptyValues);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fields =
    selectedRole === 'STUDENT'
      ? studentFields
      : staffFields[selectedRole];

  const updateValue = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setError('');
    setSuccess('');
  };

  const fillDemoData = () => {
    const suffix = Date.now().toString(36).toUpperCase().slice(-6);
    const basePhone = Number.parseInt(suffix, 36) % 100;
    const demoPhone = (offset: number) =>
      `+1 202 555 01${String((basePhone + offset) % 100).padStart(2, '0')}`;
    const password = 'SmartGateDemo@2026';
    const demoValues: Record<RegistrationRole, Record<string, string>> = {
      STUDENT: {
        name: 'Alex Morgan',
        usn: `DEMO${suffix}`,
        email: `student.demo.${suffix}@example.com`,
        phone: demoPhone(0),
        department: 'CSE',
        semester: '5',
        section: 'A',
        hostelBlock: 'Block A',
        roomNumber: '204',
        parentPhone: '+1 202 555 0175',
        password,
        confirmPassword: password,
      },
      MENTOR: {
        name: 'Riley Chen',
        employeeId: `DEMO-MENTOR-${suffix}`,
        email: `mentor.demo.${suffix}@example.com`,
        phone: demoPhone(1),
        department: 'CSE',
        designation: 'Faculty Mentor',
        password,
        confirmPassword: password,
      },
      COORDINATOR: {
        name: 'Jordan Patel',
        employeeId: `DEMO-COORD-${suffix}`,
        email: `coordinator.demo.${suffix}@example.com`,
        phone: demoPhone(2),
        department: 'ECE',
        designation: 'Department Coordinator',
        password,
        confirmPassword: password,
      },
      HOD: {
        name: 'Taylor Kim',
        employeeId: `DEMO-HOD-${suffix}`,
        email: `hod.demo.${suffix}@example.com`,
        phone: demoPhone(3),
        department: 'CSE',
        designation: 'Head of Department',
        password,
        confirmPassword: password,
      },
      SWO: {
        name: 'Casey Rivera',
        employeeId: `DEMO-SWO-${suffix}`,
        email: `swo.demo.${suffix}@example.com`,
        phone: demoPhone(4),
        officeDepartment: 'Student Affairs',
        designation: 'Student Welfare Officer',
        password,
        confirmPassword: password,
      },
      WARDEN: {
        name: 'Avery Brooks',
        employeeId: `DEMO-WARDEN-${suffix}`,
        email: `warden.demo.${suffix}@example.com`,
        phone: demoPhone(5),
        assignedHostelBlock: 'Block A',
        hostelName: 'North Residence Hall',
        designation: 'Hostel Warden',
        password,
        confirmPassword: password,
      },
      AO: {
        name: 'Jamie Quinn',
        employeeId: `DEMO-AO-${suffix}`,
        email: `ao.demo.${suffix}@example.com`,
        phone: demoPhone(6),
        administrativeDepartment: 'Administration',
        designation: 'Administrative Officer',
        password,
        confirmPassword: password,
      },
      SECURITY: {
        name: 'Skyler Reed',
        employeeId: `DEMO-SECURITY-${suffix}`,
        email: `security.demo.${suffix}@example.com`,
        phone: demoPhone(7),
        assignedGate: 'Main Gate',
        dutyLocation: 'North Campus Entrance',
        shift: 'Morning',
        password,
        confirmPassword: password,
      },
      EMERGENCY_CONTROL: {
        name: 'Drew Parker',
        employeeId: `DEMO-ECC-${suffix}`,
        email: `ecc.demo.${suffix}@example.com`,
        phone: demoPhone(8),
        assignedControlCentre: 'Campus Emergency Control Centre',
        designation: 'Emergency Control Officer',
        password,
        confirmPassword: password,
      },
    };

    setValues({ ...emptyValues(), ...demoValues[selectedRole] });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (
      values.password.length < 8 ||
      !/[A-Z]/.test(values.password) ||
      !/[a-z]/.test(values.password) ||
      !/[0-9]/.test(values.password) ||
      !/[^A-Za-z0-9]/.test(values.password)
    ) {
      setError('Password must be 8+ characters and include uppercase, lowercase, number, and special character.');
      return;
    }
    if (values.password !== values.confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }
    if (!/^\+?[0-9][0-9\s-]{7,14}$/.test(values.phone.trim())) {
      setError('Please enter a valid phone number.');
      return;
    }
    if (
      selectedRole === 'STUDENT' &&
      values.parentPhone &&
      !/^\+?[0-9][0-9\s-]{7,14}$/.test(values.parentPhone.trim())
    ) {
      setError('Please enter a valid parent phone number.');
      return;
    }

    const submission = {
      ...values,
      requestedRole: selectedRole,
      semester: selectedRole === 'STUDENT' ? Number(values.semester) : '',
    };

    setSubmitting(true);
    try {
      const result = await submitRegistration(submission);
      if (result.accountStatus !== 'ACTIVE') {
        throw new Error('The server did not confirm an ACTIVE account. Try signing in before submitting again.');
      }
      setSuccess('Registration successful! Your SmartGate account has been created. You can now sign in.');
      setValues(emptyValues());
      window.setTimeout(onSignIn, 1500);
    } catch (submitError) {
      setError((submitError as Error).message || 'Could not submit registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: RegistrationField) => {
    const required = field.required !== false;
    const commonClass =
      'w-full rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600';
    const inputId = `register-${field.name}`;
    return (
      <div key={field.name} className="min-w-0">
        <label htmlFor={inputId} className="mb-1 block text-xs font-semibold text-slate-700">
          {field.label}{required ? ' *' : ''}
        </label>
        {field.options ? (
          <select
            id={inputId}
            required={required}
            value={values[field.name]}
            onChange={(event) => updateValue(field.name, event.target.value)}
            className={commonClass}
          >
            <option value="">Select shift</option>
            {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : (
          <input
            id={inputId}
            type={field.type || 'text'}
            required={required}
            min={field.name === 'semester' ? 1 : undefined}
            max={field.name === 'semester' ? 8 : undefined}
            value={values[field.name]}
            onChange={(event) => updateValue(field.name, event.target.value)}
            autoComplete={field.name === 'email' ? 'email' : field.name === 'phone' ? 'tel' : undefined}
            className={commonClass}
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <section aria-labelledby="account-type-heading" className="space-y-3">
        <div>
          <h3 id="account-type-heading" className="text-sm font-bold text-slate-900">
            Select Your Account Type
          </h3>
          <p className="mt-1 text-xs text-slate-500">Choose a category to see its registration fields.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {roleOptions.map(({ role, label, description, icon: Icon }) => {
            const selected = role === selectedRole;
            return (
              <button
                key={label}
                type="button"
                disabled={!role}
                aria-pressed={selected}
                onClick={() => {
                  if (role) {
                    setSelectedRole(role);
                    setValues(emptyValues());
                    setError('');
                    setSuccess('');
                  }
                }}
                className={`min-h-[76px] rounded-xl border p-2.5 text-left transition-colors ${
                  !role
                    ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                    : selected
                      ? 'border-blue-700 bg-blue-50 text-[#04245c] ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/50'
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-bold leading-tight">
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </span>
                <span className="mt-1 block text-[10px] leading-snug opacity-75">{description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              {selectedRole === 'STUDENT'
                ? 'Student Registration'
                : `${roleOptions.find((option) => option.role === selectedRole)?.label} Registration`}
            </h4>
            <p className="mt-1 text-[11px] text-slate-500">Fields marked * are required.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800">
              Demo Data
            </span>
            <button
              type="button"
              onClick={fillDemoData}
              className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-[#04245c] transition-colors hover:bg-blue-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Fill Demo Data
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map(renderField)}
          <div>
            <label htmlFor="register-password" className="mb-1 block text-xs font-semibold text-slate-700">
              Password *
            </label>
            <div className="relative">
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete="new-password"
                value={values.password}
                onChange={(event) => updateValue('password', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2.5 pr-10 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((shown) => !shown)} className="absolute inset-y-0 right-2 px-1 text-slate-500">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="register-confirm-password" className="mb-1 block text-xs font-semibold text-slate-700">
              Confirm Password *
            </label>
            <div className="relative">
              <input
                id="register-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={(event) => updateValue('confirmPassword', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2.5 pr-10 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button type="button" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirmPassword((shown) => !shown)} className="absolute inset-y-0 right-2 px-1 text-slate-500">
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">{error}</div>}
        {success && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs text-emerald-900">
            {success}
          </div>
        )}

        <div className="flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
          <button type="button" onClick={onSignIn} className="text-xs font-semibold text-[#2563eb] hover:underline">
            Already registered? Sign in
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-[#04245c] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#06327d] disabled:opacity-60 sm:w-auto"
          >
            {submitting ? 'Submitting...' : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  );
}
