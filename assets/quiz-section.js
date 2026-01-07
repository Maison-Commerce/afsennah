// Quiz Section JavaScript - Global (localStorage ONLY)
(function() {
    'use strict';

    // Prevent multiple script executions
    if (window.QuizManagerInitialized) {
        return;
    }
    window.QuizManagerInitialized = true;

    const QuizManager = {
        steps: [],
        currentStepIndex: 0,
        answers: {},
        introData: {},
        recommendedProducts: [],
        calculatedPorosity: null,
        calculatedElasticity: null,
        formulationHairTreatment: null,
        formulationElixir: null,
        formulationConditioner: null,
        initialized: false,

        init() {
            // Prevent multiple initializations
            if (this.initialized) return;
            this.initialized = true;

            this.steps = Array.from(document.querySelectorAll('[data-quiz-step]'));
            if (this.steps.length === 0) return;

            // Hide all quiz steps initially
            this.steps.forEach(step => {
                step.style.display = 'none';
            });

            this.setupEventListeners();
            this.calculateQuizHeight();

            // Recalculate height on window resize
            window.addEventListener('resize', () => this.calculateQuizHeight());

            // Only show first step if there's no intro section
            const intro = document.querySelector('[data-quiz-intro]');
            if (!intro) {
                this.showCurrentStep();
            }
        },

        calculateQuizHeight() {
            
        },

        setupEventListeners() {
            this.steps.forEach((step, index) => {
                const nextBtns = step.querySelectorAll('[data-next-btn]');
                const backBtns = step.querySelectorAll('[data-back-btn]');
                const infoToggle = step.querySelector('[data-info-toggle]');
                const isFreeText = step.dataset.freeTextMode === 'true';
                const isMultiple = step.dataset.multipleChoice === 'true';

                if (isFreeText) {
                    // Handle free text fields
                    const textareas = step.querySelectorAll('.free-text-textarea');
                    textareas.forEach(textarea => {
                        textarea.addEventListener('input', () => {
                            this.handleAnswerChange(step);
                        });
                    });
                } else {
                    // Handle regular answers
                    const freshAnswers = step.querySelectorAll('input[type="radio"], input[type="checkbox"]');
                    freshAnswers.forEach(input => {
                        input.addEventListener('change', (e) => {
                            console.log('Answer changed:', input.dataset.answerValue);
                            
                            // For radio buttons, update all checkboxes in the group
                            if (input.type === 'radio') {
                                this.updateAllAnswerCheckboxStates(step);
                            } else {
                                this.updateAnswerCheckboxState(input);
                            }
                            
                            this.handleAnswerChange(step);

                            // Auto-advance for single radio selection (not multiple choice)
                            if (!isMultiple && input.type === 'radio' && input.checked) {
                                setTimeout(() => {
                                    this.nextStep();
                                }, 300);
                            }
                        });
                        
                        // Update initial state
                        this.updateAnswerCheckboxState(input);
                    });
                }

                nextBtns.forEach(nextBtn => {
                    if (nextBtn) {
                        nextBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            this.nextStep();
                        });
                    }
                });

                backBtns.forEach(backBtn => {
                    if (backBtn) {
                        backBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            this.previousStep();
                        });
                    }
                });

                if (infoToggle) {
                    infoToggle.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.toggleInfo(step);
                    });
                }

                // Close popup when clicking overlay or close button
                const infoPopup = step.querySelector('[data-info-popup]');
                if (infoPopup) {
                    const overlay = infoPopup.querySelector('[data-info-overlay]');
                    const closeBtn = infoPopup.querySelector('[data-info-close]');

                    if (overlay) {
                        overlay.addEventListener('click', () => this.closeInfo(step));
                    }

                    if (closeBtn) {
                        closeBtn.addEventListener('click', () => this.closeInfo(step));
                    }
                }
            });

            const restartBtn = document.querySelector('[data-restart-btn]');
            if (restartBtn) {
                restartBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.restart();
                });
            }

            const saveBtn = document.querySelector('[data-save-btn]');
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.saveResults();
                });
            }

            this.loadSavedResults();

            console.log('Quiz initialized with', this.steps.length, 'steps');
        },

        updateAnswerCheckboxState(input) {
            // Find the answer label containing this input
            const answerLabel = input.closest('.quiz-answer');
            if (!answerLabel) return;

            const checkbox = answerLabel.querySelector('.quiz-answer-checkbox');
            const checkboxInnerChecked = answerLabel.querySelector('.quiz-answer-checkbox-inner-checked');

            if (input.checked) {
                // Show SVG and remove border
                if (checkbox) {
                    checkbox.style.border = 'none';
                    checkbox.style.background = 'transparent';
                }
                if (checkboxInnerChecked) {
                    checkboxInnerChecked.style.display = 'block';
                }
            } else {
                // Hide SVG and restore border
                if (checkbox) {
                    checkbox.style.border = '1px solid rgba(0, 0, 0, 0.15)';
                    checkbox.style.background = '#fdfdfe';
                }
                if (checkboxInnerChecked) {
                    checkboxInnerChecked.style.display = 'none';
                }
            }
        },

        updateAllAnswerCheckboxStates(step) {
            // Update all answer checkboxes in the step
            const inputs = step.querySelectorAll('input[type="radio"], input[type="checkbox"]');
            inputs.forEach(input => {
                this.updateAnswerCheckboxState(input);
            });
        },

        updateQuizImages() {
            // Update images based on gender selection
            const genderAnswer = this.answers['gender'];
            const isMale = genderAnswer && genderAnswer.value === 'male';
            
            // Find all quiz steps with images
            const allSteps = document.querySelectorAll('[data-quiz-step]');
            
            allSteps.forEach(step => {
                const imageContainer = step.querySelector('[data-quiz-image]');
                if (!imageContainer) return;
                
                const femaleImg = imageContainer.querySelector('[data-image-female]');
                const maleImg = imageContainer.querySelector('[data-image-male]');
                
                if (isMale && maleImg) {
                    // Show male image, hide female
                    if (femaleImg) femaleImg.style.display = 'none';
                    maleImg.style.display = 'block';
                } else if (!isMale && femaleImg) {
                    // Show female image, hide male
                    femaleImg.style.display = 'block';
                    if (maleImg) maleImg.style.display = 'none';
                } else {
                    // Default: show female if available
                    if (femaleImg) femaleImg.style.display = 'block';
                    if (maleImg) maleImg.style.display = 'none';
                }
            });
        },

        handleAnswerChange(step) {
            console.log('handleAnswerChange called for step:', step.dataset.questionId);

            const questionId = step.dataset.questionId;
            const isFreeText = step.dataset.freeTextMode === 'true';
            const isMultiple = step.dataset.multipleChoice === 'true';
            const orderNotePosition = step.dataset.orderNotePosition ? parseInt(step.dataset.orderNotePosition, 10) : null;
            const nextBtns = step.querySelectorAll('[data-next-btn]');

            console.log('Question ID:', questionId, 'Is Free Text:', isFreeText, 'Is Multiple:', isMultiple, 'Order Note Position:', orderNotePosition);

            // Update images if gender question was answered
            if (questionId === 'gender') {
                this.updateQuizImages();
            }

            if (isFreeText) {
                // Handle free text fields
                const textareas = step.querySelectorAll('.free-text-textarea');
                const fields = {};
                let allFilled = true;

                textareas.forEach(textarea => {
                    const fieldId = textarea.dataset.fieldId;
                    const value = textarea.value.trim();
                    fields[fieldId] = value;

                    if (!value) {
                        allFilled = false;
                    }
                });

                this.answers[questionId] = {
                    type: 'free_text',
                    fields: fields,
                    title: Object.values(fields).filter(v => v).join(', '),
                    orderNotePosition: orderNotePosition
                };

                console.log('Free text fields:', this.answers[questionId]);
                nextBtns.forEach(btn => btn.disabled = !allFilled);
            } else {
                // Handle regular answers
                if (isMultiple) {
                    const checked = step.querySelectorAll('input:checked');
                    const answersArray = Array.from(checked).map(input => ({
                        value: input.dataset.answerValue,
                        title: input.dataset.answerTitle,
                        productHandles: input.dataset.productHandles,
                        productHandlesMale: input.dataset.productHandlesMale,
                        porosity: input.dataset.porosity,
                        elasticity: input.dataset.elasticity,
                        formulations: [
                            input.dataset.formulation1 || null,
                            input.dataset.formulation2 || null,
                            input.dataset.formulation3 || null,
                            input.dataset.formulation4 || null,
                            input.dataset.formulation5 || null,
                            input.dataset.formulation6 || null,
                            input.dataset.formulation7 || null
                        ].filter(f => f !== null && f !== '')
                    }));
                    // Add orderNotePosition to the array
                    answersArray.orderNotePosition = orderNotePosition;
                    this.answers[questionId] = answersArray;
                    console.log('Multiple answers selected:', this.answers[questionId]);
                } else {
                    const checked = step.querySelector('input:checked');
                    if (checked) {
                        this.answers[questionId] = {
                            value: checked.dataset.answerValue,
                            title: checked.dataset.answerTitle,
                            productHandles: checked.dataset.productHandles,
                            productHandlesMale: checked.dataset.productHandlesMale,
                            porosity: checked.dataset.porosity,
                            elasticity: checked.dataset.elasticity,
                            formulations: [
                                checked.dataset.formulation1 || null,
                                checked.dataset.formulation2 || null,
                                checked.dataset.formulation3 || null,
                                checked.dataset.formulation4 || null,
                                checked.dataset.formulation5 || null,
                                checked.dataset.formulation6 || null,
                                checked.dataset.formulation7 || null
                            ].filter(f => f !== null && f !== ''),
                            orderNotePosition: orderNotePosition
                        };
                        console.log('Single answer selected:', this.answers[questionId]);
                    }
                }

                const hasAnswer = isMultiple
                    ? this.answers[questionId]?.length > 0
                    : this.answers[questionId] !== undefined;

                console.log('Has answer:', hasAnswer);
                nextBtns.forEach(btn => btn.disabled = !hasAnswer);
            }

            // Save progress whenever an answer changes
            this.saveProgress();
        },

        toggleInfo(step) {
            const popup = step.querySelector('[data-info-popup]');
            if (popup) {
                popup.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        },

        closeInfo(step) {
            const popup = step.querySelector('[data-info-popup]');
            if (popup) {
                popup.classList.remove('active');
                document.body.style.overflow = '';
            }
        },

        showCurrentStep() {
            const step = this.getVisibleSteps()[this.currentStepIndex];
            if (!step) return;

            this.steps.forEach(s => s.style.display = 'none');
            step.style.display = 'block';

            setTimeout(() => step.classList.add('active'), 50);

            const backBtns = step.querySelectorAll('[data-back-btn]');
            backBtns.forEach(backBtn => {
                if (backBtn) {
                    backBtn.style.display = this.currentStepIndex > 0 ? 'flex' : 'none';
                }
            });

            const stepIndicator = step.querySelector('[data-step-indicator]');
            const visibleSteps = this.getVisibleSteps();
            if (stepIndicator) {
                stepIndicator.textContent = 'Question ' + (this.currentStepIndex + 1) + ' of ' + visibleSteps.length;
            }

            // Update all checkbox states when showing a step
            this.updateAllAnswerCheckboxStates(step);

            // Update images based on gender selection
            this.updateQuizImages();

            this.updateProgress();
            this.scrollToTop();
        },

        getVisibleSteps() {
            return this.steps.filter(step => {
                const parent = step.dataset.conditionalParent;
                const requiredValue = step.dataset.conditionalValue;

                if (!parent || !requiredValue) return true;

                const parentAnswer = this.answers[parent];
                if (!parentAnswer) return false;

                if (Array.isArray(parentAnswer)) {
                    return parentAnswer.some(a => a.value === requiredValue);
                }

                return parentAnswer.value === requiredValue;
            });
        },

        updateProgress() {
            const visibleSteps = this.getVisibleSteps();
            const progress = ((this.currentStepIndex + 1) / visibleSteps.length) * 100;

            this.steps.forEach(step => {
                const bar = step.querySelector('[data-progress-bar]');
                if (bar) bar.style.width = progress + '%';
            });
        },

        nextStep() {
            const currentStep = this.getVisibleSteps()[this.currentStepIndex];
            currentStep.classList.remove('active');

            setTimeout(() => {
                this.currentStepIndex++;
                const visibleSteps = this.getVisibleSteps();

                // Save progress before transitioning
                this.saveProgress();

                if (this.currentStepIndex >= visibleSteps.length) {
                    this.showCalculating();
                } else {
                    this.showCurrentStep();
                }
            }, 300);
        },

        previousStep() {
            const currentStep = this.getVisibleSteps()[this.currentStepIndex];
            currentStep.classList.remove('active');

            setTimeout(() => {
                this.currentStepIndex--;
                this.showCurrentStep();
            }, 300);
        },

        showCalculating() {
            this.steps.forEach(s => s.style.display = 'none');
            const calculating = document.querySelector('[data-calculating]');
            if (calculating) {
                calculating.style.display = 'block';
                setTimeout(() => calculating.classList.add('active'), 50);
                this.scrollToTop();

                // Calculate porosity and elasticity
                this.calculatePorosityAndElasticity();

                // Log formulations
                this.logFormulations();
            }
        },

        logFormulations() {
            console.log('=== FORMULATION VALUES ===');
            Object.keys(this.answers).forEach(questionId => {
                const answer = this.answers[questionId];

                if (Array.isArray(answer)) {
                    // Multiple choice answers
                    answer.forEach((a, index) => {
                        if (a.formulations && a.formulations.length > 0) {
                            console.log(`Question: ${questionId}, Answer ${index + 1}: ${a.title}`);
                            console.log('  Formulations:', a.formulations);
                        }
                    });
                } else if (answer.type !== 'free_text') {
                    // Single choice answer (not free text)
                    if (answer.formulations && answer.formulations.length > 0) {
                        console.log(`Question: ${questionId}, Answer: ${answer.title}`);
                        console.log('  Formulations:', answer.formulations);
                    }
                }
            });
            console.log('========================');
        },

        calculatePorosityAndElasticity() {
            const porosityCount = { low: 0, medium: 0, high: 0 };
            const elasticityCount = { low: 0, medium: 0, high: 0 };

            // Iterate through all answers
            Object.keys(this.answers).forEach(questionId => {
                const answer = this.answers[questionId];

                if (Array.isArray(answer)) {
                    // Multiple choice answers
                    answer.forEach(a => {
                        if (a.porosity && a.porosity !== 'none') {
                            porosityCount[a.porosity]++;
                        }
                        if (a.elasticity && a.elasticity !== 'none') {
                            elasticityCount[a.elasticity]++;
                        }
                    });
                } else if (answer.type !== 'free_text') {
                    // Single choice answer (not free text)
                    if (answer.porosity && answer.porosity !== 'none') {
                        porosityCount[answer.porosity]++;
                    }
                    if (answer.elasticity && answer.elasticity !== 'none') {
                        elasticityCount[answer.elasticity]++;
                    }
                }
            });

            // Calculate porosity result
            this.calculatedPorosity = this.determineResult(porosityCount);

            // Calculate elasticity result
            this.calculatedElasticity = this.determineResult(elasticityCount);

            console.log('Porosity counts:', porosityCount);
            console.log('Calculated Porosity:', this.calculatedPorosity);
            console.log('Elasticity counts:', elasticityCount);
            console.log('Calculated Elasticity:', this.calculatedElasticity);

            // Calculate formulation products based on porosity × elasticity
            this.calculateFormulationProducts();
        },

        calculateFormulationProducts() {
            // Formulation lookup table based on porosity × elasticity
            const formulationTable = {
                'high-high': { hairTreatment: 47, elixir: 61, conditioner: 83 },
                'high-medium': { hairTreatment: 47, elixir: 61, conditioner: 81 },
                'high-low': { hairTreatment: 51, elixir: 63, conditioner: 81 },
                'medium-high': { hairTreatment: 47, elixir: 61, conditioner: 83 },
                'medium-medium': { hairTreatment: 47, elixir: 61, conditioner: 82 },
                'medium-low': { hairTreatment: 51, elixir: 63, conditioner: 85 },
                'low-high': { hairTreatment: 47, elixir: 61, conditioner: 81 },
                'low-medium': { hairTreatment: 51, elixir: 63, conditioner: 84 },
                'low-low': { hairTreatment: 51, elixir: 63, conditioner: 85 }
            };

            // Create the key from calculated porosity and elasticity
            const key = `${this.calculatedPorosity}-${this.calculatedElasticity}`;

            // Get formulation values
            const formulations = formulationTable[key];

            if (formulations) {
                this.formulationHairTreatment = formulations.hairTreatment;
                this.formulationElixir = formulations.elixir;
                this.formulationConditioner = formulations.conditioner;

                console.log('=== FORMULATION PRODUCTS ===');
                console.log(`Porosity × Elasticity: ${this.calculatedPorosity} × ${this.calculatedElasticity}`);
                console.log(`Hair Treatment Formulation: ${this.formulationHairTreatment}`);
                console.log(`Elixir Formulation: ${this.formulationElixir}`);
                console.log(`Conditioner Formulation: ${this.formulationConditioner}`);
                console.log('============================');
            } else {
                console.warn('No formulation values found for:', key);
            }
        },

        determineResult(count) {
            const total = count.low + count.medium + count.high;

            if (total === 0) {
                return null; // No data to calculate
            }

            // Find the maximum count
            const maxCount = Math.max(count.low, count.medium, count.high);

            // Get all keys with the maximum count
            const winners = [];
            if (count.low === maxCount) winners.push('low');
            if (count.medium === maxCount) winners.push('medium');
            if (count.high === maxCount) winners.push('high');

            // If there's a tie (50/50 or 3-way tie), return medium
            if (winners.length > 1) {
                return 'medium';
            }

            // Otherwise return the single winner
            return winners[0];
        },

        showResults() {
            // *** MARK QUIZ AS COMPLETED IMMEDIATELY ***
            try {
                localStorage.setItem('quiz_completed', 'true');
                console.log('✓✓✓ Quiz marked as COMPLETED in localStorage ✓✓✓');
            } catch (e) {
                console.error('Error setting quiz completion flag:', e);
            }

            // Hide calculating screen
            const calculating = document.querySelector('[data-calculating]');
            if (calculating) {
                calculating.style.display = 'none';
            }

            const results = document.querySelector('[data-results]');
            const content = results.querySelector('.results-content');

            let html = content.innerHTML;

            // Collect all recommended products
            this.recommendedProducts = [];

            // Determine if user selected "male" for gender question
            const isMale = this.answers['gender']?.value === 'male';
            console.log('=== GENDER-BASED PRODUCT SELECTION ===');
            console.log('Gender answer:', this.answers['gender']);
            console.log('Is Male:', isMale);
            console.log('======================================');

            // Replace intro data placeholders (e.g., [[name]], [[email]])
            Object.keys(this.introData).forEach(fieldId => {
                const value = this.introData[fieldId];
                const regex = new RegExp('\\[\\[\\s*' + fieldId + '\\s*\\]\\]', 'g');
                html = html.replace(regex, value);
            });

            // Replace calculated porosity and elasticity
            if (this.calculatedPorosity) {
                const porosityRegex = new RegExp('\\[\\[\\s*porosity\\s*\\]\\]', 'g');
                html = html.replace(porosityRegex, this.calculatedPorosity);
            }
            if (this.calculatedElasticity) {
                const elasticityRegex = new RegExp('\\[\\[\\s*elasticity\\s*\\]\\]', 'g');
                html = html.replace(elasticityRegex, this.calculatedElasticity);
            }

            // Replace question answer placeholders
            Object.keys(this.answers).forEach(questionId => {
                const answer = this.answers[questionId];
                let replacement = '';

                if (answer.type === 'free_text') {
                    // For free text questions, use all field values
                    replacement = answer.title;
                } else if (Array.isArray(answer)) {
                    replacement = answer.map(a => a.title).join(', ');
                    // Collect products from multiple answers
                    answer.forEach(a => {
                        const hasMaleProducts = a.productHandlesMale && a.productHandlesMale !== '';
                        const hasFemaleProducts = a.productHandles && a.productHandles !== '';

                        let productHandlesToUse = '';

                        if (isMale) {
                            // User is male - ONLY use male products, never fallback to female
                            if (hasMaleProducts) {
                                productHandlesToUse = a.productHandlesMale;
                                console.log(`Using MALE products for answer "${a.title}":`, productHandlesToUse);
                            } else {
                                console.log(`NO male products assigned for answer "${a.title}" - skipping`);
                            }
                        } else {
                            // User is female/not male - use female products only
                            if (hasFemaleProducts) {
                                productHandlesToUse = a.productHandles;
                                console.log(`Using FEMALE products for answer "${a.title}":`, productHandlesToUse);
                            } else {
                                console.log(`NO female products assigned for answer "${a.title}" - skipping`);
                            }
                        }

                        if (productHandlesToUse) {
                            const products = productHandlesToUse.split(',').map(p => p.trim()).filter(p => p);
                            this.recommendedProducts.push(...products);
                        }
                    });
                } else {
                    replacement = answer.title;
                    // Collect products from single answer
                    const hasMaleProducts = answer.productHandlesMale && answer.productHandlesMale !== '';
                    const hasFemaleProducts = answer.productHandles && answer.productHandles !== '';

                    let productHandlesToUse = '';

                    if (isMale) {
                        // User is male - ONLY use male products, never fallback to female
                        if (hasMaleProducts) {
                            productHandlesToUse = answer.productHandlesMale;
                            console.log(`Using MALE products for answer "${answer.title}":`, productHandlesToUse);
                        } else {
                            console.log(`NO male products assigned for answer "${answer.title}" - skipping`);
                        }
                    } else {
                        // User is female/not male - use female products only
                        if (hasFemaleProducts) {
                            productHandlesToUse = answer.productHandles;
                            console.log(`Using FEMALE products for answer "${answer.title}":`, productHandlesToUse);
                        } else {
                            console.log(`NO female products assigned for answer "${answer.title}" - skipping`);
                        }
                    }

                    if (productHandlesToUse) {
                        const products = productHandlesToUse.split(',').map(p => p.trim()).filter(p => p);
                        this.recommendedProducts.push(...products);
                    }
                }

                const regex = new RegExp('\\[\\[\\s*' + questionId + '\\s*\\]\\]', 'g');
                html = html.replace(regex, replacement);
            });

            // Remove duplicates from recommended products
            this.recommendedProducts = [...new Set(this.recommendedProducts)];

            console.log('Recommended Products:', this.recommendedProducts);

            content.innerHTML = html;

            // Populate answers table
            this.populateAnswersTable();

            results.style.display = 'block';
            setTimeout(() => results.classList.add('active'), 50);

            this.scrollToTop();
        },

        populateAnswersTable() {
            const table = document.querySelector('[data-answers-table]');
            if (!table) return;

            // Get visible questions list from results section
            const resultsSection = document.querySelector('[data-results]');
            const visibleQuestionsStr = resultsSection?.dataset.visibleQuestions || '';

            console.log('Raw visible questions string:', visibleQuestionsStr);

            const visibleQuestions = visibleQuestionsStr
                .split(',')
                .map(q => q.trim())
                .filter(q => q);

            console.log('Parsed visible questions:', visibleQuestions);
            console.log('Visible questions count:', visibleQuestions.length);

            let tableHTML = '';

            // Add intro data first (always shown by default)
            Object.keys(this.introData).forEach(fieldId => {
                const value = this.introData[fieldId];
                const formattedFieldId = fieldId.replace(/_/g, ' ');
                tableHTML += '<tr><td>' + formattedFieldId + '</td><td>' + value + '</td></tr>';
            });

            // Add question answers (filtered if visibleQuestions is set)
            Object.keys(this.answers).forEach(questionId => {
                console.log('Checking question:', questionId);

                // If visibleQuestions list exists and this question is not in it, skip
                if (visibleQuestions.length > 0 && !visibleQuestions.includes(questionId)) {
                    console.log('  - Skipping (not in visible list)');
                    return;
                }

                console.log('  - Including in table');

                const answer = this.answers[questionId];
                let answerText = '';

                if (answer.type === 'free_text') {
                    answerText = answer.title;
                } else if (Array.isArray(answer)) {
                    answerText = answer.map(a => a.title).join(', ');
                } else {
                    answerText = answer.title;
                }

                // Capitalize and replace underscores with spaces
                const formattedQuestionId = questionId.replace(/_/g, ' ');

                tableHTML += '<tr><td>' + formattedQuestionId + '</td><td>' + answerText + '</td></tr>';
            });

            table.innerHTML = tableHTML;

            console.log('Table populated with', table.querySelectorAll('tr').length, 'rows');
        },

        restart() {
            // IMMEDIATELY clear completion flag FIRST
            this.clearCompletion();
            console.log('🔄 RESTART: Completion flag cleared');
            this.currentStepIndex = 0;
            this.answers = {};

            // Clear progress
            this.clearProgress();

            // Clear completion flag so they need to complete again
            this.clearCompletion();

            const results = document.querySelector('[data-results]');
            results.classList.remove('active');
            setTimeout(() => {
                results.style.display = 'none';

                this.steps.forEach(step => {
                    step.querySelectorAll('input').forEach(input => input.checked = false);
                    step.querySelectorAll('[data-next-btn]').forEach(btn => btn.disabled = true);
                });

                this.showCurrentStep();
            }, 300);
        },

        saveResults() {
            try {
                const quizData = {
                    introData: this.introData,
                    answers: this.answers,
                    recommendedProducts: this.recommendedProducts,
                    calculatedPorosity: this.calculatedPorosity,
                    calculatedElasticity: this.calculatedElasticity,
                    formulationHairTreatment: this.formulationHairTreatment,
                    formulationElixir: this.formulationElixir,
                    formulationConditioner: this.formulationConditioner,
                    timestamp: new Date().toISOString()
                };
                const quizDataStr = JSON.stringify(quizData);
                localStorage.setItem('quiz_results', quizDataStr);

                console.log('Results saved successfully to localStorage');
            } catch (e) {
                console.error('Save error:', e);
            }
        },

        saveProgress() {
            try {
                const visibleSteps = this.getVisibleSteps();

                const progressData = {
                    currentStepIndex: this.currentStepIndex,
                    introData: this.introData,
                    answers: this.answers,
                    timestamp: Date.now()
                };

                const progressDataStr = JSON.stringify(progressData);

                // Save to localStorage only
                localStorage.setItem('quiz_progress', progressDataStr);

                // Verify it was saved
                const savedData = localStorage.getItem('quiz_progress');
                if (savedData) {
                    const verifyData = JSON.parse(savedData);
                    console.log('Progress saved:');
                    console.log('  - Current step index:', this.currentStepIndex);
                    console.log('  - Visible step:', this.currentStepIndex + 1, 'of', visibleSteps.length);
                    console.log('  - Total answers saved:', Object.keys(this.answers).length);
                    console.log('  - Storage: localStorage');
                    console.log('  - Data size:', progressDataStr.length, 'characters');

                    if (verifyData.currentStepIndex !== this.currentStepIndex) {
                        console.error('WARNING: Verification failed! Expected', this.currentStepIndex, 'but got', verifyData.currentStepIndex);
                    }
                } else {
                    console.error('ERROR: Progress was not saved to localStorage!');
                }
            } catch (e) {
                console.error('Progress save error:', e);
            }
        },

        resumeQuiz() {
            try {
                const progressDataStr = localStorage.getItem('quiz_progress');

                if (progressDataStr) {
                    const progressData = JSON.parse(progressDataStr);

                    console.log('Resuming quiz with data:', progressData);

                    // Restore state
                    this.introData = progressData.introData || {};
                    this.answers = progressData.answers || {};

                    // Get visible steps based on restored answers
                    const visibleSteps = this.getVisibleSteps();

                    // Set current step index
                    this.currentStepIndex = Math.min(progressData.currentStepIndex, visibleSteps.length - 1);

                    console.log('Total steps:', this.steps.length);
                    console.log('Visible steps:', visibleSteps.length);
                    console.log('Restored currentStepIndex:', progressData.currentStepIndex);
                    console.log('Setting currentStepIndex to:', this.currentStepIndex);

                    // Restore selections in the DOM
                    Object.keys(this.answers).forEach(questionId => {
                        const step = Array.from(this.steps).find(s => s.dataset.questionId === questionId);
                        if (!step) return;

                        const answer = this.answers[questionId];
                        const isFreeText = step.dataset.freeTextMode === 'true';

                        if (isFreeText && answer.type === 'free_text') {
                            // Restore free text fields
                            Object.keys(answer.fields).forEach(fieldId => {
                                const textarea = step.querySelector(`[data-field-id="${fieldId}"]`);
                                if (textarea) {
                                    textarea.value = answer.fields[fieldId];
                                }
                            });
                        } else if (Array.isArray(answer)) {
                            // Multiple choice - check all selected answers
                            answer.forEach(a => {
                                const input = step.querySelector(`input[value="${a.value}"]`);
                                if (input) {
                                    input.checked = true;
                                    this.updateAnswerCheckboxState(input);
                                }
                            });
                        } else {
                            // Single choice - check the selected answer
                            const input = step.querySelector(`input[value="${answer.value}"]`);
                            if (input) {
                                input.checked = true;
                                this.updateAnswerCheckboxState(input);
                            }
                        }

                        // Enable next button if answer exists
                        const nextBtns = step.querySelectorAll('[data-next-btn]');
                        nextBtns.forEach(btn => { if (btn) btn.disabled = false; });
                    });

                    console.log('Restored answers:', this.answers);
                    console.log('Showing step at index:', this.currentStepIndex);

                    // Show current step
                    this.showCurrentStep();
                    
                    // Update images based on saved gender selection
                    this.updateQuizImages();
                } else {
                    console.log('No saved progress found');
                    this.showCurrentStep();
                }
            } catch (e) {
                console.error('Resume error:', e);
                this.showCurrentStep();
            }
        },

        clearProgress() {
            // Clear localStorage
            localStorage.removeItem('quiz_progress');

            // Also clear completion flag when clearing progress
            this.clearCompletion();

            // Reset state
            this.currentStepIndex = 0;
            this.answers = {};
            this.introData = {};

            // Clear all inputs
            this.steps.forEach(step => {
                step.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
                    input.checked = false;
                });
                step.querySelectorAll('textarea').forEach(textarea => {
                    textarea.value = '';
                });
                const nextBtns = step.querySelectorAll('[data-next-btn]');
                nextBtns.forEach(btn => { if (btn) btn.disabled = true; });
            });

            console.log('Quiz progress cleared from localStorage');
        },

        loadSavedResults() {
            // Silent load - no banner, just allow retaking
            try {
                const savedResults = localStorage.getItem('quiz_results');
                if (savedResults) {
                    console.log('Previous quiz results found - user can retake to override');
                }
            } catch (e) {
                console.log('No saved results found');
            }
        },

        scrollToTop() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        },

        markComplete() {
            try {
                localStorage.setItem('quiz_completed', 'true');
                console.log('✓ Quiz marked as completed');
            } catch (e) {
                console.error('Error marking quiz complete:', e);
            }
        },

        clearCompletion() {
            try {
                localStorage.removeItem('quiz_completed');
                console.log('✓ Quiz completion cleared');
            } catch (e) {
                console.error('Error clearing completion:', e);
            }
        },

        isCompleted() {
            return localStorage.getItem('quiz_completed') === 'true';
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => QuizManager.init());
    } else {
        QuizManager.init();
    }

    // Make QuizManager globally accessible
    window.QuizManager = QuizManager;

    // Re-initialize on Shopify theme editor events
    if (typeof Shopify !== 'undefined' && Shopify.designMode) {
        document.addEventListener('shopify:section:load', () => {
            QuizManager.initialized = false;
            QuizManager.init();
        });
    }
})();