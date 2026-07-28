//! Cairo executable loading and trace adaptation.
//!
//! This module deliberately owns the Cairo compiler/VM seam. Callers provide
//! flattened Cairo Serde arguments; the rest of the workspace never needs to
//! understand executable hints, proof-mode runner configuration, or STWO trace
//! adaptation.

use std::fs::File;
use std::path::Path;

use cairo_lang_executable::executable::{EntryPointKind, Executable};
use cairo_lang_runner::{build_hints_dict, Arg, CairoHintProcessor};
use cairo_vm::cairo_run::{cairo_run_program_with_initial_scope, CairoRunConfig};
use cairo_vm::hint_processor::hint_processor_definition::HintProcessor;
use cairo_vm::types::builtin_name::BuiltinName;
use cairo_vm::types::exec_scope::ExecutionScopes;
use cairo_vm::types::layout_name::LayoutName;
use cairo_vm::types::program::Program;
use cairo_vm::types::relocatable::MaybeRelocatable;
use cairo_vm::Felt252;
use stwo_cairo_adapter::adapter::adapt;
use stwo_cairo_adapter::{ProverInput, PublicSegmentContext};
use thiserror::Error;

/// Failure while turning a Cairo executable invocation into STWO prover input.
#[derive(Debug, Error)]
pub enum ExecutionError {
    /// The executable artifact could not be opened.
    #[error("cannot open Cairo executable {path}: {source}")]
    Open {
        path: String,
        source: std::io::Error,
    },
    /// The executable JSON is malformed or incompatible with Cairo 2.15.0.
    #[error("invalid Cairo executable: {0}")]
    InvalidExecutable(String),
    /// The executable has no standalone entry point.
    #[error("Cairo executable has no standalone entry point")]
    MissingEntrypoint,
    /// The Cairo VM rejected the invocation.
    #[error("Cairo execution failed: {0}")]
    CairoVm(String),
    /// The VM trace could not be adapted to STWO.
    #[error("Cairo trace adaptation failed: {0}")]
    TraceAdaptation(String),
}

struct RunnableProgram {
    program: Program,
    hint_processor: Box<dyn HintProcessor>,
    builtins: Vec<BuiltinName>,
}

/// Execute a Cairo 2.15 executable in proof mode and adapt its trace for STWO.
pub(crate) fn execute_and_adapt(
    executable_path: &Path,
    flattened_arguments: Vec<Felt252>,
) -> Result<ProverInput, ExecutionError> {
    let file = File::open(executable_path).map_err(|source| ExecutionError::Open {
        path: executable_path.display().to_string(),
        source,
    })?;
    let executable: Executable = serde_json::from_reader(file)
        .map_err(|error| ExecutionError::InvalidExecutable(error.to_string()))?;
    let arguments = flattened_arguments.into_iter().map(Arg::Value).collect();
    let RunnableProgram {
        program,
        mut hint_processor,
        builtins,
    } = program_and_hints(&executable, arguments)?;

    let config = CairoRunConfig {
        trace_enabled: true,
        relocate_trace: false,
        layout: LayoutName::all_cairo_stwo,
        fill_holes: true,
        proof_mode: true,
        disable_trace_padding: true,
        ..Default::default()
    };
    let runner = cairo_run_program_with_initial_scope(
        &program,
        &config,
        hint_processor.as_mut(),
        ExecutionScopes::new(),
    )
    .map_err(|error| ExecutionError::CairoVm(error.to_string()))?;

    let mut input =
        adapt(&runner).map_err(|error| ExecutionError::TraceAdaptation(error.to_string()))?;
    // stwo-cairo-adapter 1.3.0 defaults to a bootloader context because its
    // original JSON-program path was bootloader-oriented. A standalone Cairo
    // executable exposes only its own builtin pointer arguments; claiming all
    // bootloader segments makes the lookup sum unsatisfiable.
    input.public_segment_context = PublicSegmentContext::new(&builtins);
    Ok(input)
}

fn program_and_hints(
    executable: &Executable,
    arguments: Vec<Arg>,
) -> Result<RunnableProgram, ExecutionError> {
    let data: Vec<MaybeRelocatable> = executable
        .program
        .bytecode
        .iter()
        .map(Felt252::from)
        .map(MaybeRelocatable::from)
        .collect();
    let (hints, string_to_hint) = build_hints_dict(&executable.program.hints);
    let entrypoint = executable
        .entrypoints
        .iter()
        .find(|entrypoint| matches!(entrypoint.kind, EntryPointKind::Standalone))
        .ok_or(ExecutionError::MissingEntrypoint)?;
    let builtins = entrypoint.builtins.clone();
    let program = Program::new_for_proof(
        builtins.clone(),
        data,
        entrypoint.offset,
        entrypoint.offset + 4,
        hints,
        Default::default(),
        Default::default(),
        vec![],
        None,
    )
    .map_err(|error| ExecutionError::InvalidExecutable(error.to_string()))?;

    let hint_processor = CairoHintProcessor {
        runner: None,
        user_args: vec![vec![Arg::Array(arguments)]],
        string_to_hint,
        starknet_state: Default::default(),
        run_resources: Default::default(),
        syscalls_used_resources: Default::default(),
        no_temporary_segments: false,
        markers: Default::default(),
        panic_traceback: Default::default(),
    };

    Ok(RunnableProgram {
        program,
        hint_processor: Box::new(hint_processor),
        builtins,
    })
}
