const { Pet, Foster, Application, StateLog } = require('./models');

// FSM Lifecycle Constraints for Pets
const PET_TRANSITIONS = {
  'Intake': ['In Medical Isolation', 'Available for Foster'],
  'In Medical Isolation': ['Available for Foster'],
  'Available for Foster': ['Fostered'],
  'Fostered': ['Pending Adoption', 'Available for Foster'],
  'Pending Adoption': ['Adopted', 'Fostered', 'Available for Foster'],
  'Adopted': []
};

// Application Pipeline Sequential Stages
const APPLICATION_STAGES = [
  'Applied',
  'Background Check Completed',
  'Home Video Verified',
  'Approved'
];

async function transitionPetStatus(petId, newStatus) {
  const pet = await Pet.findByPk(petId);
  if (!pet) throw new Error("Pet not found.");

  const validNextStates = PET_TRANSITIONS[pet.status] || [];
  if (!validNextStates.includes(newStatus)) {
    throw new Error(`Invalid FSM Transition: Cannot move from '${pet.status}' to '${newStatus}'.`);
  }

  const previousStatus = pet.status;
  pet.status = newStatus;
  await pet.save();

  await StateLog.create({ petId: pet.id, previousStatus, newStatus });
  return pet;
}

async function advanceApplicationStage(applicationId, newStage) {
  const app = await Application.findByPk(applicationId);
  if (!app) throw new Error("Application not found.");

  const currentIndex = APPLICATION_STAGES.indexOf(app.stage);
  const targetIndex = APPLICATION_STAGES.indexOf(newStage);

  if (targetIndex !== currentIndex + 1) {
    throw new Error(`Invalid Pipeline Jump: Must move sequentially from '${app.stage}' to '${APPLICATION_STAGES[currentIndex + 1]}'.`);
  }

  app.stage = newStage;
  await app.save();
  return app;
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + 
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 10) / 10;
}

async function getRankedFostersForPet(petId) {
  const pet = await Pet.findByPk(petId);
  if (!pet) throw new Error("Pet not found.");

  const availableFosters = await Foster.findAll({ where: { isAvailable: true } });

  return availableFosters.map(foster => {
    let score = 100;
    if (foster.certifiedMedicalTier < pet.requiredMedicalTier) return null;
    if (pet.weightKg > foster.maxPetWeightKg) return null;

    const distanceKm = calculateDistanceKm(pet.latitude, pet.longitude, foster.latitude, foster.longitude);
    score -= (distanceKm * 2);

    if (pet.dogAggressionLevel > 2 && foster.hasExistingPets) score -= (pet.dogAggressionLevel * 15);
    if (foster.certifiedMedicalTier === pet.requiredMedicalTier) score += 10;

    return {
      fosterId: foster.id,
      fosterName: foster.name,
      distanceKm: `${distanceKm} km`,
      compatibilityScore: Math.max(Math.round(score), 0)
    };
  })
  .filter(item => item !== null)
  .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}

module.exports = { transitionPetStatus, advanceApplicationStage, getRankedFostersForPet, calculateDistanceKm };