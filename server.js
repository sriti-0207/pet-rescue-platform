const express = require('express');
const { sequelize, Pet, Foster, Application, MedicalLog, SupplyRequest, SupplyHub, StateLog } = require('./models');
const { transitionPetStatus, advanceApplicationStage, getRankedFostersForPet, calculateDistanceKm } = require('./engine');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// --- PET LIFECYCLE & MATCHING ---
app.patch('/api/pets/:id/transition', async (req, res) => {
  try { res.json({ message: "Transition successful", pet: await transitionPetStatus(req.params.id, req.body.newStatus) }); } 
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/pets/:id/matches', async (req, res) => {
  try { res.json({ petId: req.params.id, matches: await getRankedFostersForPet(req.params.id) }); } 
  catch (err) { res.status(400).json({ error: err.message }); }
});

// --- APPLICATION PIPELINE ENGINE ---
app.post('/api/applications', async (req, res) => {
  try { res.status(201).json(await Application.create(req.body)); } 
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.patch('/api/applications/:id/advance', async (req, res) => {
  try { res.json({ message: "Pipeline advanced", application: await advanceApplicationStage(req.params.id, req.body.newStage) }); } 
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/applications', async (req, res) => {
  res.json(await Application.findAll());
});

// --- MEDICAL & SUPPLY CHECKLISTS (CRUD) ---
app.post('/api/medical-logs', async (req, res) => {
  try { res.status(201).json(await MedicalLog.create(req.body)); } 
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/medical-logs/:petId', async (req, res) => {
  res.json(await MedicalLog.findAll({ where: { petId: req.params.petId } }));
});

app.post('/api/supply-requests', async (req, res) => {
  try { res.status(201).json(await SupplyRequest.create(req.body)); } 
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/supply-requests', async (req, res) => {
  res.json(await SupplyRequest.findAll());
});

// --- GEOLOCATED SUPPLY PICKUP QUERY ---
app.get('/api/supply-hubs', async (req, res) => {
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

app.get('/api/logs', async (req, res) => { res.json(await StateLog.findAll()); });

// --- DATABASE SEEDING & INITIALIZATION ---
sequelize.sync({ force: true }).then(async () => {
  const pet = await Pet.create({ name: "Rex", status: "Intake", dogAggressionLevel: 1, requiredMedicalTier: 2, weightKg: 12.5, latitude: 23.8103, longitude: 90.4125 });
  const foster = await Foster.create({ name: "Sarah (Experienced)", hasExistingPets: false, certifiedMedicalTier: 2, maxPetWeightKg: 20.0, isAvailable: true, latitude: 23.8223, longitude: 90.4225 });
  await Foster.create({ name: "John (Basic)", hasExistingPets: true, certifiedMedicalTier: 1, maxPetWeightKg: 30.0, isAvailable: true, latitude: 23.8150, longitude: 90.4150 });

  // Seed Application, Medical Log, and Supply Hub
  await Application.create({ adopterName: "Alice Miller", petId: pet.id, stage: "Applied" });
  await MedicalLog.create({ petId: pet.id, medicationName: "Rabies Vaccine", dosage: "1ml", notes: "First dose complete" });
  await SupplyHub.create({ name: "Central Shelter Hub", address: "123 Main St", latitude: 23.8120, longitude: 90.4130 });

  app.listen(3000, () => {
    console.log("Server active on http://localhost:3000");
  });
});