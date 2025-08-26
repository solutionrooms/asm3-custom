Custom version of ASM
extra instructions here
for main instructions see BASE_README.md

## Custom Patient Induction System

This fork includes a specialized **Patient Induction** system designed for hedgehog rescue operations with modern UI and automated features.

### Key Features

#### 🎨 **Modern 2-Column Layout**
- Responsive card-based design with hover effects
- Organized sections: Basic Information, Animal Details, Location & Housing, etc.
- Mobile-responsive (automatically stacks on smaller screens)
- Professional gradient backgrounds and smooth transitions

#### 🔄 **Automatic Age Calculation**
- **Entry Age Range** dropdown with options: Baby (<1), Juvenile (1-2), Adult (2-5), Senior (5+)
- Automatically calculates estimated Date of Birth based on selected age range
- Sets "Estimated DOB" checkbox automatically
- Uses midpoint calculations (e.g., Baby = 6 months ago, Adult = 3.5 years ago)

#### 📍 **Found Location Tracking**
New section captures rescue context:
- **Weather Conditions**: Freezing, Cold, Warm, Hot dropdown
- **Found By**: Person lookup for rescue contact
- **Location Description**: Multi-line text field for detailed location notes

#### 🏥 **Dynamic Physical Inspection System**
- **Automatic Field Detection**: Any additional field starting with `entryinspection*` appears automatically
- **Severity Levels**: No, Slight, Moderate, Severe dropdown options
- **Color-Coded Cards**: Visual feedback with green/yellow/orange/red backgrounds
- **Responsive Grid**: Multi-column layout that adapts to screen size
- **Zero Maintenance**: Add new inspection fields in admin - they appear automatically

#### 🦔 **Hedgehog-Specific Optimizations**
- Species and Breed fields hidden (but still submitted for data integrity)
- Weight field moved to prominent position in Animal Details
- Base Color field repositioned for better workflow
- Streamlined form focused on hedgehog intake priorities

### Setup Instructions

#### 1. Additional Fields Configuration
Create additional fields in ASM3 Admin with these specifications:

**Custom Entry Fields:**
- `entryagerange` - Select - Options: Baby (<1)|Juvenile (1-2)|Adult (2-5)|Senior (5+)
- `entrylocationweather` - Select - Options: Freezing|Cold|Warm|Hot  
- `entrylocationdescription` - Multi-line Text
- `entryfoundbyperson` - Person Link

**Inspection Fields (automatically detected):**
- `entryinspectioncold` - Select - Options: No|Slight|Moderate|Severe
- `entryinspectiondehydrated` - Select - Options: No|Slight|Moderate|Severe  
- `entryinspectionunderweight` - Select - Options: No|Slight|Moderate|Severe
- Add more `entryinspection*` fields as needed - they auto-appear in inspection section

#### 2. Access the Patient Induction System
- Navigate to **Hedghog Menu → Patient Induction**
- Or access via URL: `/animal_induction` or `/patient_registration`
- Requires `ACCESS_HEDGHOG` permission

### Usage Workflow

1. **Basic Information**: Enter name, age range (auto-calculates DOB), sex
2. **Animal Details**: Type, color, coat, weight, size  
3. **Found Location**: Weather, finder contact, location details
4. **Entry Information**: Entry type, dates, fees
5. **Physical Inspection**: Multi-field assessment with visual severity indicators
6. **Save**: Creates animal record with all custom data

### Technical Notes

- Built on ASM3's tableform system with custom rendering
- Uses additional fields system for maintainable dropdowns
- jQuery-based interactivity with modern CSS Grid layouts
- Fully integrated with ASM3's validation and submission systems
- Custom styling with CSS-in-JS approach for component isolation