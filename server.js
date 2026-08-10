const path = require('path');
const express = require('express');
const cors = require('cors');
const { sequelize, Pet, Foster, Application, MedicalLog, SupplyRequest, SupplyHub, StateLog, User } = require('./models');
const { transitionPetStatus, advanceApplicationStage, getRankedFostersForPet, calculateDistanceKm } = require('./engine');
const { signupAdopter, login, authenticate, authorize } = require('./auth');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors()); // safety net if frontend/backend ever run on different origins
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serves public/index.html at http://localhost:3000/

// =========================================================
// AUTH
//   - /api/auth/signup  -> ADOPTERS ONLY (public self sign-up)
//   - /api/auth/login    -> admin, foster, adopter (DB credentials)
// =========================================================
app.post('/api/auth/signup', async (req, res) => {
  try {
    const user = await signupAdopter(req.body);
    res.status(201).json({ message: 'Account created. Please log in.', username: user.username, role: user.role });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await login(req.body);
    res.json(result); // { token, user: { id, username, role, fosterId } }
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Every route below this line requires a valid logged-in session
app.use(authenticate);

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user });
});

// =========================================================
// PET DIRECTORY (read)
//   - admin/foster: full record set, all statuses
//   - adopter: only pets currently adoptable, with management fields stripped
// =========================================================
app.get('/api/pets', async (req, res) => {
  const pets = await Pet.findAll();

  if (req.user.role === 'admin' || req.user.role === 'foster') {
    return res.json(pets);
  }

  // Adopter view: view-only, limited to adoptable animals, no internal fields
  const adoptable = pets
    .filter(p => p.status === 'Available for Foster' || p.status === 'Fostered' || p.status === 'Pending Adoption')
    .map(p => ({ id: p.id, name: p.name, status: p.status, weightKg: p.weightKg }));
  res.json(adoptable);
});

// =========================================================
// PET LIFECYCLE, CRUD & MATCHING — admin + foster ONLY
// =========================================================
app.post('/api/pets', authorize('admin', 'foster'), async (req, res) => {
  try { res.status(201).json(await Pet.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/pets/:id', authorize('admin', 'foster'), async (req, res) => {
  try {
    const pet = await Pet.findByPk(req.params.id);
    if (!pet) return res.status(404).json({ error: 'Pet not found.' });
    await pet.update(req.body);
    res.json(pet);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/pets/:id', authorize('admin', 'foster'), async (req, res) => {
  try {
    const pet = await Pet.findByPk(req.params.id);
    if (!pet) return res.status(404).json({ error: 'Pet not found.' });
    await pet.destroy();
    res.json({ message: 'Pet removed.' });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/pets/:id/transition', authorize('admin', 'foster'), async (req, res) => {
  try { res.json({ message: "Transition successful", pet: await transitionPetStatus(req.params.id, req.body.newStatus) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/pets/:id/matches', authorize('admin', 'foster'), async (req, res) => {
  try { res.json({ petId: req.params.id, matches: await getRankedFostersForPet(req.params.id) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

// =========================================================
// APPLICATION PIPELINE — adopters submit; admin/foster review & advance
// =========================================================
app.post('/api/applications', authorize('adopter'), async (req, res) => {
  try {
    res.status(201).json(await Application.create({ ...req.body, adopterName: req.user.username }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/applications/:id/advance', authorize('admin', 'foster'), async (req, res) => {
  try { res.json({ message: "Pipeline advanced", application: await advanceApplicationStage(req.params.id, req.body.newStage) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/applications', authorize('admin', 'foster'), async (req, res) => {
  res.json(await Application.findAll());
});

// =========================================================
// MEDICAL & SUPPLY CHECKLISTS — admin + foster ONLY (not visible to adopters)
// =========================================================
app.post('/api/medical-logs', authorize('admin', 'foster'), async (req, res) => {
  try { res.status(201).json(await MedicalLog.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/medical-logs/:petId', authorize('admin', 'foster'), async (req, res) => {
  res.json(await MedicalLog.findAll({ where: { petId: req.params.petId } }));
});

app.post('/api/supply-requests', authorize('admin', 'foster'), async (req, res) => {
  try { res.status(201).json(await SupplyRequest.create(req.body)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/supply-requests', authorize('admin', 'foster'), async (req, res) => {
  res.json(await SupplyRequest.findAll());
});

app.get('/api/supply-hubs', authorize('admin', 'foster'), async (req, res) => {
  const { lat, lon, radiusKm } = req.query;
  const hubs = await SupplyHub.findAll();

  if (!lat || !lon) return res.json(hubs);

  const nearbyHubs = hubs.map(hub => {
    const distanceKm = calculateDistanceKm(parseFloat(lat), parseFloat(lon), hub.latitude, hub.longitude);
    return { ...hub.toJSON(), distanceKm };
  })
  .filter(hub => hub.distanceKm <= (parseFloat(radiusKm) || 10.0))
  .sort((a, b) => a.distanceKm - b.distanceKm);

  res.json(nearbyHubs);
});

app.get('/api/logs', authorize('admin'), async (req, res) => { res.json(await StateLog.findAll()); });

// =========================================================
// DATABASE SEEDING & INITIALIZATION
//   NOTE: Admin & Foster accounts are created here (not via signup).
//   Whoever runs the server hands these credentials to the real
//   admin/foster staff out-of-band.
// =========================================================
sequelize.sync({ force: true }).then(async () => {
  const pet = await Pet.create({ name: "Rex", status: "Intake", dogAggressionLevel: 1, requiredMedicalTier: 2, weightKg: 12.5, latitude: 23.8103, longitude: 90.4125 });
  const foster1 = await Foster.create({ name: "Sarah (Experienced)", hasExistingPets: false, certifiedMedicalTier: 2, maxPetWeightKg: 20.0, isAvailable: true, latitude: 23.8223, longitude: 90.4225 });
  const foster2 = await Foster.create({ name: "John (Basic)", hasExistingPets: true, certifiedMedicalTier: 1, maxPetWeightKg: 30.0, isAvailable: true, latitude: 23.8150, longitude: 90.4150 });

  // Seed Medical Log and Supply Hub
  await MedicalLog.create({ petId: pet.id, medicationName: "Rabies Vaccine", dosage: "1ml", notes: "First dose complete" });
  await SupplyHub.create({ name: "Central Shelter Hub", address: "123 Main St", latitude: 23.8120, longitude: 90.4130 });

  // Seed User accounts — these are the ONLY way admin/foster get in (no public signup for them)
  const adminHash = await bcrypt.hash('admin123', 10);
  const fosterHash1 = await bcrypt.hash('foster123', 10);
  const fosterHash2 = await bcrypt.hash('foster456', 10);

  await User.create({ username: 'admin1', passwordHash: adminHash, role: 'admin' });
  await User.create({ username: `foster-${foster1.id}`, passwordHash: fosterHash1, role: 'foster', fosterId: foster1.id });
  await User.create({ username: `foster-${foster2.id}`, passwordHash: fosterHash2, role: 'foster', fosterId: foster2.id });

  app.listen(3000, () => {
    console.log("Server active on http://localhost:3000");
    console.log("Seeded accounts (DB id = username):");
    console.log("  admin  -> username: admin1        password: admin123");
    console.log("  foster -> username: foster-" + foster1.id + "     password: foster123");
    console.log("  foster -> username: foster-" + foster2.id + "     password: foster456");
    console.log("Adopters sign up themselves via the Sign Up form.");
  });
});
